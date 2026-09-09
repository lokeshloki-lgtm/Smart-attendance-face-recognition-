import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import { sendAbsentNotificationEmail } from './emailService.js';

const getAttendanceClosingTime = () => process.env.ATTENDANCE_CLOSING_TIME || '18:00';

const getClosedDate = () => {
  const now = new Date();
  const [hours, minutes] = getAttendanceClosingTime().split(':').map(Number);
  const closed = now.getHours() > hours || (now.getHours() === hours && now.getMinutes() >= minutes);
  const date = new Date(now);
  if (!closed) date.setDate(date.getDate() - 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const markAbsentStudents = async (targetDate = getClosedDate()) => {
  const nextDate = new Date(targetDate);
  nextDate.setDate(nextDate.getDate() + 1);

  const students = await User.find({
    isActive: true,
    role: { $in: ['STUDENT', 'USER', 'TEACHER'] },
  }).select('name email studentId employeeId department profilePhoto');

  let created = 0;
  for (const student of students) {
    const result = await Attendance.updateOne(
      { userId: student._id, date: { $gte: targetDate, $lt: nextDate } },
      {
        $setOnInsert: {
          userId: student._id,
          studentId: student.studentId || student.employeeId || null,
          studentName: student.name,
          name: student.name,
          rollNumber: student.studentId || student.employeeId || null,
          date: targetDate,
          checkInTime: '--:--:--',
          time: '--:--:--',
          status: 'Absent',
          facePhoto: student.profilePhoto || null,
          faceVerified: false,
          livenessVerified: false,
          verificationMethod: 'Manual',
          deviceInfo: 'Automatic absence scheduler',
          device: 'Automatic absence scheduler',
          faceVerified: false,
        },
      },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
      created += 1;
      sendAbsentNotificationEmail({ user: student, date: targetDate }).catch((error) => {
        console.error(`Absent notification failed for ${student.email}:`, error.message);
      });
    }
  }

  return { checked: students.length, created, date: targetDate.toISOString().split('T')[0] };
};

export const startAbsenceScheduler = () => {
  const run = async () => {
    try {
      const result = await markAbsentStudents();
      console.log(`✓ Absence sync: ${result.created} absent record(s) created for ${result.date}`);
    } catch (error) {
      console.error('✗ Absence sync failed:', error.message);
    }
  };

  void run();
  return setInterval(run, 60 * 60 * 1000);
};
