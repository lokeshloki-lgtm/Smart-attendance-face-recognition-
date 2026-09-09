import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import FaceCapture from '../../components/FaceCapture';
import { faceAPI } from '../../services/api';

const RegisterFacePage = () => {
  const [capture, setCapture] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (capture?.descriptor && !saving && !message) void registerFace();
  }, [capture, saving, message]);

  const registerFace = async () => {
    if (!capture?.descriptor) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await faceAPI.register(capture.descriptor);
      setMessage(response.data.message || 'Face registered successfully.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Face registration failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link to="/user/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline dark:text-indigo-400">
          <ArrowLeft size={16} /> Back to dashboard
        </Link>
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Register my face</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Save your face embedding securely so attendance can recognize you.</p>
        </div>
        <div className="max-w-3xl"><FaceCapture onCapture={setCapture} disabled={saving || Boolean(message)} />{error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}{message && <p className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 size={17} /> {message}</p>}</div>
      </main>
    </div>
  );
};

export default RegisterFacePage;
