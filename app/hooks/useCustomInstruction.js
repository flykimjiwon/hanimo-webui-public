import logger from '@/lib/logger';
import { useState, useEffect } from 'react';

export function useCustomInstruction(currentRoom, rooms) {
  const [customInstruction, setCustomInstruction] = useState('');
  const [customInstructionActive, setCustomInstructionActive] = useState(false);
  const [showCustomInstructionModal, setShowCustomInstructionModal] = useState(false);

  useEffect(() => {
    if (!currentRoom || !rooms.length) return;
    const room = rooms.find((r) => r._id === currentRoom);
    setCustomInstruction(room?.customInstruction || '');
    setCustomInstructionActive(room?.customInstructionActive || false);
  }, [currentRoom, rooms]);

  const saveCustomInstruction = async (text, active) => {
    if (!currentRoom) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    const prevText = customInstruction;
    const prevActive = customInstructionActive;
    setCustomInstruction(text);
    setCustomInstructionActive(active);

    try {
      const res = await fetch(`/api/webapp-chat/room/${currentRoom}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customInstruction: text, customInstructionActive: active }),
      });
      if (!res.ok) {
        setCustomInstruction(prevText);
        setCustomInstructionActive(prevActive);
      }
    } catch (e) {
      logger.warn('Failed to save custom instruction:', e);
      setCustomInstruction(prevText);
      setCustomInstructionActive(prevActive);
    }
  };

  return {
    customInstruction,
    setCustomInstruction,
    customInstructionActive,
    setCustomInstructionActive,
    showCustomInstructionModal,
    setShowCustomInstructionModal,
    saveCustomInstruction,
  };
}
