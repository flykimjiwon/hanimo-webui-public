'use client';

import { createContext, useContext } from 'react';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ user, children }) {
  const value = {
    user,
    isReadOnly: user?.role === 'manager',
    isAdmin: user?.role === 'admin',
    isManager: user?.role === 'manager',
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return context;
}
