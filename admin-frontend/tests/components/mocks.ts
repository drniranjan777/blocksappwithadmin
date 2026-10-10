import { vi } from 'vitest';

/**
 * Stand-ins for the three things components reach for: who is signed in, the API, and the hooks that
 * fetch lists. Each test file wires them in with `vi.mock(..., () => import('./mocks'))`-style factories
 * (see the top of any component test) and then sets what it needs.
 */

// ------------------------------------------------------------------ session --

export interface FakeStaff {
  id: string;
  name: string;
  email: string;
  roles: Array<{ key: string; name: string }>;
  permissions: string[];
}

const state = {
  session: undefined as { nextStep: null | string; admin: FakeStaff } | null | undefined,
  signOut: vi.fn(async () => undefined),
  reload: vi.fn(async () => undefined),
};

/** Signs a pretend staff member in with exactly these permissions. */
export function signInAs(permissions: string[], overrides: Partial<FakeStaff> = {}): FakeStaff {
  const admin: FakeStaff = {
    id: 'staff-1',
    name: 'Test Staff',
    email: 'staff@blocks.test',
    roles: [{ key: 'tester', name: 'Tester' }],
    permissions,
    ...overrides,
  };
  state.session = { nextStep: null, admin };
  return admin;
}

export const sessionMock = {
  useSession: () => ({
    session: state.session,
    can: (...wanted: string[]) =>
      wanted.length === 0 || wanted.some((p) => state.session?.admin.permissions.includes(p)),
    reload: state.reload,
    signOut: state.signOut,
  }),
  SessionProvider: ({ children }: { children: unknown }) => children,
  stepPath: () => '/login',
};
export const signOutSpy = state.signOut;

// ---------------------------------------------------------------------- API --

export const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};
export const mockAuth = { call: vi.fn() };

// ------------------------------------------------------------- data hooks --

/** What `useApi(path)` returns, by path. Anything not set is "loaded, empty". */
export const apiResponses = new Map<string, unknown>();
/** What `useCursorList(path)` returns, by path. */
export const listResponses = new Map<string, unknown[]>();
/** Every `useCursorList(path, params)` call, in order, so a test can see which filters were sent. */
export const listCalls: Array<{ path: string | null; params: Record<string, unknown> }> = [];
export const mutateSpy = vi.fn(async () => undefined);
export const reloadSpy = vi.fn(async () => undefined);

export const hooksMock = {
  useApi: (path: string | null) => {
    if (path === null) return { data: undefined, error: undefined, isLoading: false, mutate: mutateSpy };
    const hit = apiResponses.get(path);
    if (hit instanceof Error) return { data: undefined, error: hit, isLoading: false, mutate: mutateSpy };
    return {
      data: hit === undefined ? undefined : { data: hit },
      error: undefined,
      isLoading: false,
      mutate: mutateSpy,
    };
  },
  useCursorList: (path: string | null, params: Record<string, unknown> = {}) => {
    listCalls.push({ path, params });
    const items = path ? (listResponses.get(path) ?? []) : [];
    return {
      items,
      hasMore: false,
      loading: false,
      loadingMore: false,
      error: undefined,
      loadMore: vi.fn(),
      reload: reloadSpy,
    };
  },
};

/** Forget everything between tests. */
export function resetMocks(): void {
  state.session = undefined;
  state.signOut.mockClear();
  for (const fn of Object.values(mockApi)) fn.mockReset();
  mockAuth.call.mockReset();
  apiResponses.clear();
  listResponses.clear();
  listCalls.length = 0;
  mutateSpy.mockClear();
  reloadSpy.mockClear();
}
