import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginFlow } from '@/components/auth/login-flow';
import { ApiError } from '@/lib/client/api';
import { mockAuth, resetMocks } from './mocks';

vi.mock('@/lib/client/api', async () => ({
  ...(await vi.importActual<typeof import('@/lib/client/api')>('@/lib/client/api')),
  authApi: (await import('./mocks')).mockAuth,
}));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') } }));

const admin = { id: 'a1', name: 'Staff', email: 's@blocks.test', roles: [], permissions: [] };
const assign = vi.fn();

/** What the API answers at each step, keyed by action. */
function script(answers: Record<string, unknown | ApiError>) {
  mockAuth.call.mockImplementation(async (action: string) => {
    const a = answers[action];
    if (a instanceof ApiError) throw a;
    if (a === undefined) throw new ApiError(404, 'NOT_FOUND', 'No such step');
    return { data: a };
  });
}

beforeEach(() => {
  resetMocks();
  assign.mockClear();
  Object.defineProperty(window, 'location', { value: { assign }, writable: true });
});

const notSignedIn = new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');

describe('signing in', () => {
  it('starts at the e-mail and password form when nobody is signed in', async () => {
    script({ session: notSignedIn });
    render(<LoginFlow />);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('asks for both before sending anything', async () => {
    script({ session: notSignedIn });
    const user = userEvent.setup();
    render(<LoginFlow />);
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter your work e-mail address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(mockAuth.call).not.toHaveBeenCalledWith('login', expect.anything());
  });

  it("shows the API's message for wrong details, and keeps the form so the person can try again", async () => {
    script({
      session: notSignedIn,
      login: new ApiError(401, 'INVALID_CREDENTIALS', 'The e-mail or password is not right.'),
    });
    const user = userEvent.setup();
    render(<LoginFlow />);
    await user.type(await screen.findByLabelText('E-mail'), 'asha@blocks.test');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The e-mail or password is not right.');
    expect(screen.getByLabelText('E-mail')).toHaveValue('asha@blocks.test');
  });

  it('tells a person who tried too often when to try again', async () => {
    script({ session: notSignedIn, login: new ApiError(429, 'RATE_LIMITED', 'Slow down', { retryAfterSeconds: 42 }) });
    const user = userEvent.setup();
    render(<LoginFlow />);
    await user.type(await screen.findByLabelText('E-mail'), 'asha@blocks.test');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 42 seconds');
  });
});

describe('the steps after the password', () => {
  it('goes on to the code, and into the console once it is right', async () => {
    script({
      session: notSignedIn,
      login: { nextStep: 'two_factor', admin },
      verify: { nextStep: null, admin },
    });
    const user = userEvent.setup();
    render(<LoginFlow />);
    await user.type(await screen.findByLabelText('E-mail'), 'asha@blocks.test');
    await user.type(screen.getByLabelText('Password'), 'a-good-password-here');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('heading', { name: 'Enter your code' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('6-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mockAuth.call).toHaveBeenCalledWith('verify', { method: 'totp', code: '123456' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
  });

  it('will not send a code that is not six digits', async () => {
    script({ session: { nextStep: 'two_factor', admin } });
    const user = userEvent.setup();
    render(<LoginFlow />);
    await user.type(await screen.findByLabelText('6-digit code'), 'abc123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('6 digits');
    expect(mockAuth.call).not.toHaveBeenCalledWith('verify', expect.anything());
  });

  it('accepts a backup code instead', async () => {
    script({ session: { nextStep: 'two_factor', admin }, verify: { nextStep: null, admin } });
    const user = userEvent.setup();
    render(<LoginFlow />);
    await user.click(await screen.findByRole('button', { name: 'Use a backup code instead' }));
    await user.type(screen.getByLabelText('Backup code'), 'ABCD-EFGH-JK');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(mockAuth.call).toHaveBeenCalledWith('verify', { method: 'backup_code', code: 'ABCD-EFGH-JK' }),
    );
  });

  it('clears a wrong code so the next try starts fresh', async () => {
    script({
      session: { nextStep: 'two_factor', admin },
      verify: new ApiError(401, 'OTP_INVALID', 'That code is not right.'),
    });
    const user = userEvent.setup();
    render(<LoginFlow />);
    await user.type(await screen.findByLabelText('6-digit code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right.');
    expect(screen.getByLabelText('6-digit code')).toHaveValue('');
  });

  it('makes someone with a temporary password choose their own first', async () => {
    script({ session: { nextStep: 'password_change', admin }, password: { nextStep: 'two_factor_setup', admin } });
    const user = userEvent.setup();
    render(<LoginFlow />);
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Current password'), 'temporary-password');
    await user.type(screen.getByLabelText('New password'), 'too short');
    await user.type(screen.getByLabelText('Repeat new password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText('Use at least 14 characters.')).toBeInTheDocument();
    expect(screen.getByText('The two passwords do not match.')).toBeInTheDocument();
    expect(mockAuth.call).not.toHaveBeenCalledWith('password', expect.anything());
  });

  it('will not accept the old password as the new one', async () => {
    script({ session: { nextStep: 'password_change', admin } });
    const user = userEvent.setup();
    render(<LoginFlow />);
    await user.type(await screen.findByLabelText('Current password'), 'a-long-temporary-password');
    await user.type(screen.getByLabelText('New password'), 'a-long-temporary-password');
    await user.type(screen.getByLabelText('Repeat new password'), 'a-long-temporary-password');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText('Choose a password you have not used for this account.')).toBeInTheDocument();
  });

  it('sets up an authenticator, then shows the backup codes and lets the person in only after they confirm they saved them', async () => {
    script({
      session: { nextStep: 'two_factor_setup', admin },
      'two-factor/setup': { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/BLOCKS:s?secret=JBSWY3DPEHPK3PXP' },
      'two-factor/confirm': { nextStep: null, admin, backupCodes: ['AAAA-BBBB-CC', 'DDDD-EEEE-FF'] },
    });
    const user = userEvent.setup();
    render(<LoginFlow />);

    expect(await screen.findByAltText('QR code for your authenticator app')).toBeInTheDocument();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    await user.type(screen.getByLabelText('6-digit code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Turn on and continue' }));

    expect(await screen.findByRole('heading', { name: 'Save your backup codes' })).toBeInTheDocument();
    expect(screen.getByText('AAAA-BBBB-CC')).toBeInTheDocument();
    const enter = screen.getByRole('button', { name: 'Enter the console' });
    expect(enter).toBeDisabled();
    await user.click(screen.getByLabelText('I have saved these codes somewhere safe.'));
    await user.click(enter);
    expect(assign).toHaveBeenCalledWith('/');
  });

  it('asks the API for a new authenticator secret exactly once, even if the page renders twice', async () => {
    script({
      session: { nextStep: 'two_factor_setup', admin },
      'two-factor/setup': { secret: 'S', otpauthUri: 'otpauth://x' },
    });
    const { rerender } = render(<LoginFlow />);
    await screen.findByAltText('QR code for your authenticator app');
    rerender(<LoginFlow />);
    expect(mockAuth.call.mock.calls.filter(([action]) => action === 'two-factor/setup')).toHaveLength(1);
  });

  it('goes straight into the console when the person is already fully signed in', async () => {
    script({ session: { nextStep: null, admin } });
    render(<LoginFlow />);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
  });
});
