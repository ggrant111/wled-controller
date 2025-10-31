'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import ConfirmModal from './ConfirmModal';

type ModalType = 'confirm' | 'alert';

interface ConfirmModalData {
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: 'default' | 'danger' | 'warning';
}

interface ModalContextValue {
  showConfirm: (data: ConfirmModalData) => void;
  showAlert: (message: string, title?: string, onClose?: () => void) => void;
}

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}

export default function ModalProvider({ children }: { children: React.ReactNode }) {
  const [confirmModal, setConfirmModal] = useState<ConfirmModalData | null>(null);
  const [alertModal, setAlertModal] = useState<{ message: string; title?: string; onClose?: () => void } | null>(null);

  const showConfirm = useCallback((data: ConfirmModalData) => {
    setConfirmModal(data);
  }, []);

  const showAlert = useCallback((message: string, title?: string, onClose?: () => void) => {
    setAlertModal({ message, title, onClose });
  }, []);

  const handleConfirmClose = useCallback(() => {
    if (confirmModal?.onCancel) {
      confirmModal.onCancel();
    }
    setConfirmModal(null);
  }, [confirmModal]);

  const handleConfirmConfirm = useCallback(() => {
    if (confirmModal) {
      confirmModal.onConfirm();
      setConfirmModal(null);
    }
  }, [confirmModal]);

  const handleAlertClose = useCallback(() => {
    if (alertModal?.onClose) {
      alertModal.onClose();
    }
    setAlertModal(null);
  }, [alertModal]);

  return (
    <ModalContext.Provider value={{ showConfirm, showAlert }}>
      {children}
      {confirmModal && (
        <ConfirmModal
          isOpen={true}
          message={confirmModal.message}
          title={confirmModal.title}
          confirmText={confirmModal.confirmText}
          cancelText={confirmModal.cancelText}
          variant={confirmModal.variant || 'default'}
          onConfirm={handleConfirmConfirm}
          onCancel={handleConfirmClose}
        />
      )}
      {alertModal && (
        <ConfirmModal
          isOpen={true}
          message={alertModal.message}
          title={alertModal.title || 'Alert'}
          confirmText="OK"
          hideCancel={true}
          onConfirm={handleAlertClose}
        />
      )}
    </ModalContext.Provider>
  );
}

