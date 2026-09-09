import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import FaceCapture from '../../components/FaceCapture';
import { Card } from '../../components/common';
import { attendanceAPI } from '../../services/api';

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
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
    (locationError) => reject(new Error({
      1: 'Location permission was denied. Allow location access, then choose Retry.',
      2: 'Your location is unavailable. Check device location settings, then choose Retry.',
      3: 'The location request timed out. Check GPS or network access, then choose Retry.',
    }[locationError.code] || 'Your location could not be obtained. Choose Retry and try again.')),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
  );
});

const MarkAttendancePage = () => {
  const [capture, setCapture] = useState(null);
  const [status, setStatus] = useState({ message: '', error: '' });
  const [submitting, setSubmitting] = useState(false);
  const [alreadyMarked, setAlreadyMarked] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [phase, setPhase] = useState('detecting');
  const verificationLockRef = useRef(false);

  const markAttendance = async () => {
    if (!capture?.descriptor || verificationLockRef.current) return;
    verificationLockRef.current = true;
    setSubmitting(true);
    setStatus({ message: '', error: '' });
    try {
      setPhase('verifying');
      setPhase('locating');
      const coordinates = await getCurrentLocation();
      setPhase('submitting');
      const response = await attendanceAPI.mark({
        faceDescriptor: capture.descriptor,
        detectionConfidence: capture.detectionConfidence,
        detectedFaceCount: capture.detectedFaceCount,
        livenessPassed: true,
        ...coordinates,
        mapsLink: `https://www.google.com/maps?q=${coordinates.latitude},${coordinates.longitude}`,
      });
      setStatus({ message: response.data.message || 'Attendance marked successfully.', error: '' });
    } catch (requestError) {
      setAlreadyMarked(requestError.response?.status === 409);
      setStatus({ message: '', error: requestError.response?.data?.message || 'Attendance could not be marked.' });
      setCapture(null);
      setResetKey((current) => current + 1);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (capture?.descriptor && !submitting && !status.message && !status.error && !alreadyMarked) void markAttendance();
  }, [capture, submitting, status.message, status.error, alreadyMarked]);

  const retry = () => {
    verificationLockRef.current = false;
    setCapture(null);
    setStatus({ message: '', error: '' });
    setAlreadyMarked(false);
    setPhase('detecting');
    setResetKey((current) => current + 1);
  };

  return <div className="min-h-screen bg-gray-50 dark:bg-slate-950 dark:text-slate-100"><Navbar /><main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8"><Link to="/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline dark:text-indigo-400"><ArrowLeft size={16} /> Back to dashboard</Link><h1 className="text-3xl font-bold">Attendance kiosk</h1><p className="mt-2 text-gray-600 dark:text-gray-400">Recognize an enrolled member and record today&apos;s attendance.</p><div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.7fr)]"><FaceCapture resetKey={resetKey} onCapture={(nextCapture) => { if (!verificationLockRef.current) { setCapture(nextCapture); setAlreadyMarked(false); setStatus({ message: '', error: '' }); } }} disabled={submitting || Boolean(status.message) || alreadyMarked} /><Card><h2 className="text-lg font-bold">Mark recognized member</h2><p className="mt-2 text-sm text-gray-500">The server identifies the closest active registered face and prevents duplicate records.</p>{capture?.image && <img src={capture.image} alt="Captured face" className="mt-5 aspect-video w-full rounded-lg object-cover" />}{capture && !status.error && !status.message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{phase === 'locating' ? 'Getting location...' : phase === 'submitting' ? 'Marking attendance...' : 'Verifying face...'}</p>}{status.error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"><p>{status.error}</p><button type="button" onClick={retry} className="mt-3 rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold hover:bg-red-100">Retry verification</button></div>}{status.message && <p className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 size={17} /> {status.message}</p>}</Card></div></main></div>;
};

export default MarkAttendancePage;
