/**
 * Auth Store — 本地认证 + 邮箱验证
 *
 * 使用 localStorage 实现轻量级本地认证。
 * 注册时验证邮箱格式，登录时校验已注册账户。
 * 数据全部存储在浏览器端。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string; // simple hash, not for production security
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

// ── Helpers ──
const USERS_KEY = 'mdp_registered_users';

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function generateId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getStoredUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveStoredUsers(users: StoredUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      loading: false,
      error: null,

      initialize: async () => {
        // With persist middleware, user is auto-restored from localStorage
        set({ loading: false });
      },

      signUp: async (email, password, name) => {
        set({ loading: true, error: null });

        // Validate email format
        if (!isValidEmail(email)) {
          set({ error: '请输入有效的邮箱地址', loading: false });
          return false;
        }

        // Validate password length
        if (password.length < 6) {
          set({ error: '密码至少需要 6 位', loading: false });
          return false;
        }

        // Validate name
        if (!name.trim()) {
          set({ error: '请输入昵称', loading: false });
          return false;
        }

        // Check if email already registered
        const users = getStoredUsers();
        if (users.some(u => u.email === email)) {
          set({ error: '该邮箱已注册，请直接登录', loading: false });
          return false;
        }

        // Create user
        const newUser: StoredUser = {
          id: generateId(),
          email,
          name: name.trim(),
          passwordHash: simpleHash(password),
        };

        users.push(newUser);
        saveStoredUsers(users);

        set({
          user: { id: newUser.id, email: newUser.email, name: newUser.name },
          loading: false,
        });

        return true;
      },

      signIn: async (email, password) => {
        set({ loading: true, error: null });

        // Validate email format
        if (!isValidEmail(email)) {
          set({ error: '请输入有效的邮箱地址', loading: false });
          return false;
        }

        // Find user
        const users = getStoredUsers();
        const user = users.find(u => u.email === email);

        if (!user) {
          set({ error: '账户不存在，请先注册', loading: false });
          return false;
        }

        // Check password
        if (user.passwordHash !== simpleHash(password)) {
          set({ error: '密码错误', loading: false });
          return false;
        }

        set({
          user: { id: user.id, email: user.email, name: user.name },
          loading: false,
        });

        return true;
      },

      signOut: async () => {
        set({ user: null });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'mdp-auth',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
