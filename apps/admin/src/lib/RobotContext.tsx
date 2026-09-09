'use client';

import { createContext, useContext } from 'react';
import type { RobotState } from '@hermes/shared';
import { useRobotState, type ConnectionState } from './useRobotState';

/**
 * Provider เดียวสำหรับสถานะหุ่น — layout เปิด connection เดียว,
 * ทุกหน้า consume ผ่าน useRobot() (ไม่เปิด socket ซ้ำ)
 */
interface RobotContextValue {
  state: RobotState | null;
  connection: ConnectionState;
}

const RobotContext = createContext<RobotContextValue>({
  state: null,
  connection: 'connecting',
});

export function RobotProvider({ children }: { children: React.ReactNode }) {
  const value = useRobotState();
  return <RobotContext.Provider value={value}>{children}</RobotContext.Provider>;
}

export function useRobot(): RobotContextValue {
  return useContext(RobotContext);
}
