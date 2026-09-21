import React from 'react';
import { ShiftType, Role } from '../types';
import { Shield, UserCheck, Key, LogOut, Search, Bell, Grid, User } from 'lucide-react';

interface HeaderProps {
  shift: ShiftType;
  operationalDate: string;
  technicianNames: string[];
  role: Role;
  onOpenShiftModal: () => void;
  onOpenSupervisorLogin: () => void;
  onLogoutSupervisor: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = () => {
  return null;
};
