import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '@/config';

export function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function hashPin(pin: string): Promise<string> {
  return bcryptjs.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(pin, hash);
}

export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

export function generateToken(payload: any): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRE,
  });
}

export function generateAccessToken(payload: any): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRE,
  });
}

export function generateRefreshToken(payload: any): string {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRE,
  });
}

export function verifyToken(token: string): any {
  return jwt.verify(token, config.JWT_SECRET);
}

export function verifyRefreshToken(token: string): any {
  return jwt.verify(token, config.JWT_REFRESH_SECRET);
}

export function generateRandomString(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function formatPhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(amount);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-ZA').format(date);
}
