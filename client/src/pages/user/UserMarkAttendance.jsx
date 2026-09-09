import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import FaceCapture from '../../components/FaceCapture';
import { Card } from '../../components/common';
import { attendanceAPI } from '../../services/api';

const MAX_ATTENDANCE_RETRIES = 3;
const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const createSessionId = () => `attendance-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getCurrentLocation = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error('Location is unavailable in this browser. Please use HTTPS or localhost and try again.'));
    return;
  }

  const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  if (!window.isSecureContext && !isLocalhost) {
    reject(new Error('Location requires a secure HTTPS connection. Open the deployed app over HTTPS and try again.'));
    return;
  }

  const requestLocation = () => navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
    (locationError) => {
      const messages = {
        1: 'Location permission was denied. Allow location access to mark attendance, then choose Retry.',
        2: 'Your location is unavailable. Check your device location settings, then choose Retry.',
        3: 'The location request timed out. Check your GPS or network connection, then choose Retry.',
      };
      reject(new Error(messages[locationError.code] || 'Your location could not be obtained. Choose Retry and try again.'));
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
  );

  if (navigator.permissions?.query) {
    navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
      if (permission.state === 'denied') {
        reject(new Error('Location permission was denied. Allow location access to mark attendance, then choose Retry.'));
        return;
      }
      requestLocation();
    }).catch(requestLocation);
    return;
  }

  requestLocation();
});

const getLocationAddress = async ({ latitude, longitude }) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=en`, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    return [data.locality, data.city, data.principalSubdivision, data.countryName].filter(Boolean).join(', ') || null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
};

const playAttendanceSuccessSound = async () => {
  const audio = new Audio('/assets/attendance-success.mpeg');
  audio.preload = 'auto';
  try {
    await audio.play();
  } catch (audioError) {
    console.warn('[Attendance] success sound was blocked by the browser', { message: audioError.message });
  }
};

const retryDelay = (requestError, retryCount) => {
  const retryAfter = requestError.response?.headers?.['retry-after'];
  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) return retryAfterSeconds * 1000;
  const retryAfterDate = Date.parse(retryAfter);
  return Number.isFinite(retryAfterDate) && retryAfterDate > Date.now()
    ? retryAfterDate - Date.now()
    : 1000 * (2 ** retryCount);
};

const UserMarkAttendance = () => {
  const navigate = useNavigate();
  const [capture, setCapture] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alreadyMarked, setAlreadyMarked] = useState(false);
  const [phase, setPhase] = useState('detecting');
  const [resetKey, setResetKey] = useState(0);
  const submissionLockRef = useRef(false);
  const sessionIdRef = useRef(createSessionId());

  const markAttendance = async () => {
    if (!capture?.descriptor || submissionLockRef.current) return;
    submissionLockRef.current = true;
    setSubmitting(true);
    setPhase('verifying');
    setError('');
    setMessage('');
    console.debug('[Attendance] face match captured', { sessionId: sessionIdRef.current, detectionConfidence: capture.detectionConfidence });
    try {
      setPhase('locating');
      const coordinates = await getCurrentLocation();
      const locationAddress = await getLocationAddress(coordinates);
      setPhase('submitting');
      for (let retryCount = 0; retryCount <= MAX_ATTENDANCE_RETRIES; retryCount += 1) {
        try {
          console.debug('[Attendance] submission start', { sessionId: sessionIdRef.current, retryCount });
          const response = await attendanceAPI.mark({
            faceDescriptor: capture.descriptor,
            detectionConfidence: capture.detectionConfidence,
            detectedFaceCount: capture.detectedFaceCount,
            livenessPassed: true,
            deviceName: navigator.userAgent,
            ...coordinates,
            mapsLink: `https://www.google.com/maps?q=${coordinates.latitude},${coordinates.longitude}`,
            locationAddress,
          }, { headers: { 'X-Attendance-Session-Id': sessionIdRef.current } });
          console.debug('[Attendance] submission success', { sessionId: sessionIdRef.current, status: response.status, retryCount });
          await playAttendanceSuccessSound();
          setPhase('success');
          setMessage('Attendance marked successfully!');
          window.setTimeout(() => navigate('/user/attendance'), 900);
          return;
        } catch (requestError) {
          const status = requestError.response?.status;
          console.warn('[Attendance] submission response', { sessionId: sessionIdRef.current, status, retryCount });
          if (status !== 429 || retryCount === MAX_ATTENDANCE_RETRIES) throw requestError;
          const delay = retryDelay(requestError, retryCount);
          console.warn('[Attendance] rate limited; retrying', { sessionId: sessionIdRef.current, retryCount: retryCount + 1, delay });
          await wait(delay);
        }
      }
    } catch (requestError) {
      const duplicate = requestError.response?.status === 409 && requestError.response?.data?.message?.includes('already marked');
      const rateLimited = requestError.response?.status === 429;
      const authFailure = requestError.response?.status === 401
        && ['No authorization token provided', 'Invalid or expired token'].includes(requestError.response?.data?.message);
      setPhase('error');
      setAlreadyMarked(duplicate);
      setError(authFailure ? 'Your session has expired. Please sign in again before marking attendance.' : duplicate ? 'Already Marked Today' : rateLimited ? 'Attendance server is temporarily busy. Please try again in a moment.' : requestError.response?.data?.message || requestError.message || 'Attendance could not be marked. Please try again.');
      console.error('[Attendance] final failure', { sessionId: sessionIdRef.current, status: requestError.response?.status, retryCount: MAX_ATTENDANCE_RETRIES });
      setCapture(null);
      setResetKey((current) => current + 1);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (capture?.descriptor && !message && !error && !alreadyMarked && !submitting) void markAttendance();
  }, [capture, message, error, alreadyMarked, submitting]);

  const retry = () => {
    submissionLockRef.current = false;
    sessionIdRef.current = createSessionId();
    setCapture(null);
    setError('');
    setMessage('');
    setAlreadyMarked(false);
    setPhase('detecting');
    setResetKey((current) => current + 1);
  };

  return (
    <div className="min-h-screen bg-[#071522] text-slate-100">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link to="/user/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-white"><ArrowLeft size={16} /> Back to dashboard</Link>
        <div className="mb-8"><p className="font-mono-label text-xs text-cyan-300">Verification / live check-in</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight">Mark attendance</h1><p className="mt-2 text-slate-400">Keep your face inside the camera frame for automatic verification.</p></div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.7fr)]">
          <FaceCapture resetKey={resetKey} onCapture={(nextCapture) => { if (!submissionLockRef.current) { setCapture(nextCapture); setPhase('detecting'); setAlreadyMarked(false); setError(''); } }} disabled={submitting || Boolean(message) || alreadyMarked} />
          <Card className="border border-cyan-300/15 bg-[#0d2638]/90">
            <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="text-cyan-300" size={19} /> Secure verification</h2>
            <p className="mt-2 text-sm text-slate-400">Attendance submits automatically after one clear face matches the registered descriptor within the configured face-distance threshold.</p>
            {capture?.image && <img src={capture.image} alt="Captured face" className="mt-5 aspect-video w-full rounded-lg object-cover" />}
            {capture && !error && !message && <p className="mt-4 rounded-lg bg-emerald-400/10 p-3 text-sm text-emerald-200">{phase === 'verifying' ? 'Verifying face...' : phase === 'locating' ? 'Getting location...' : phase === 'submitting' ? 'Marking attendance...' : 'Face detected. Verifying identity...'}</p>}
            {error && <div className="mt-4 rounded-lg bg-rose-400/10 p-3 text-sm text-rose-200"><p>{error}</p><button type="button" onClick={retry} className="mt-3 rounded-lg border border-rose-300/40 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-300/10">Retry verification</button></div>}
            {message && <p className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-400/10 p-3 text-sm font-semibold text-emerald-200"><CheckCircle2 size={17} /> {message}</p>}
          </Card>
        </div>
      </main>
    </div>
  );
};

export default UserMarkAttendance;
