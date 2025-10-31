'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Info, AlertCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger' | 'warning';
  hideCancel?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export default function ConfirmModal({
  isOpen,
  message,
  title,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  hideCancel = false,
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  const getIcon = () => {
    switch (variant) {
      case 'danger':
        return <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0" />;
      default:
        return <Info className="w-6 h-6 text-blue-500 flex-shrink-0" />;
    }
  };

  const getConfirmButtonClass = () => {
    switch (variant) {
      case 'danger':
        return 'px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors';
      case 'warning':
        return 'px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors';
      default:
        return 'px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors';
    }
  };

  const modalContent = isOpen ? (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100000]" />
        {/* Modal */}
        <div className="fixed inset-0 flex items-center justify-center z-[100001] p-4 pointer-events-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="glass-card p-6 max-w-md w-full mx-4 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              {getIcon()}
              <div className="flex-1">
                {title && (
                  <h3 className="text-xl font-bold mb-2">{title}</h3>
                )}
                <p className="text-sm text-gray-300 whitespace-pre-wrap">{message}</p>
              </div>
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex gap-3 justify-end flex-wrap">
              {!hideCancel && onCancel && (
                <button
                  onClick={onCancel}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  {cancelText}
                </button>
              )}
              <button
                onClick={onConfirm}
                className={getConfirmButtonClass()}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      </>
    </AnimatePresence>
  ) : null;

  // Portal to document.body to ensure it's above all other modals
  if (typeof window === 'undefined') {
    return null;
  }

  return createPortal(modalContent, document.body);
}

