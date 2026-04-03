"use client";
import AdminPortal from '@/components/AdminPortal';

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0f] transition-colors">
      <AdminPortal onClose={() => window.history.back()} />
    </div>
  );
}
