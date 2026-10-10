import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReasonDialog } from '@/components/forms/reason-dialog';
import { ApiError } from '@/lib/client/api';

function setup(onConfirm = vi.fn(async () => undefined)) {
  const onClose = vi.fn();
  render(
    <ReasonDialog
      open
      onClose={onClose}
      title="Suspend this account"
      confirmLabel="Suspend"
      tone="bad"
      onConfirm={onConfirm}
    >
      <p>@asha will be signed out everywhere.</p>
    </ReasonDialog>,
  );
  return { onConfirm, onClose, user: userEvent.setup() };
}

describe('the reason dialog', () => {
  it('shows what is about to happen and asks why', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Suspend this account' })).toBeInTheDocument();
    expect(screen.getByText('@asha will be signed out everywhere.')).toBeInTheDocument();
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();
    expect(screen.getByText('Recorded in the audit log with your name.')).toBeInTheDocument();
  });

  it('puts the cursor in the reason box so typing can start at once', async () => {
    setup();
    await waitFor(() => expect(screen.getByLabelText('Reason')).toHaveFocus());
  });

  it('refuses a reason that is too short, and does nothing', async () => {
    const { user, onConfirm, onClose } = setup();
    await user.type(screen.getByLabelText('Reason'), 'short');
    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText('Give a reason of at least 10 characters.')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not count spaces as a reason', async () => {
    const { user, onConfirm } = setup();
    await user.type(screen.getByLabelText('Reason'), '              ');
    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText('Give a reason of at least 10 characters.')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('sends the reason, trimmed, and closes when it works', async () => {
    const { user, onConfirm, onClose } = setup();
    await user.type(screen.getByLabelText('Reason'), '  Repeated harassment reports  ');
    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Repeated harassment reports'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open and says what went wrong when the API refuses', async () => {
    const { user, onClose } = setup(
      vi.fn(async () => Promise.reject(new ApiError(409, 'CONFLICT', 'That account is already suspended.'))),
    );
    await user.type(screen.getByLabelText('Reason'), 'A perfectly good reason');
    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That account is already suspended.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeEnabled();
  });

  it('puts a problem the API found with the reason itself next to the reason', async () => {
    const reject = new ApiError(400, 'VALIDATION_FAILED', 'Invalid.', {
      details: [{ field: 'reason', reasons: ['must be longer than or equal to 10 characters'] }],
    });
    const { user } = setup(vi.fn(async () => Promise.reject(reject)));
    await user.type(screen.getByLabelText('Reason'), 'A perfectly good reason');
    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText('must be longer than or equal to 10 characters')).toBeInTheDocument();
  });

  it('closes without doing anything on Cancel', async () => {
    const { user, onConfirm, onClose } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cannot be sent twice by a double click', async () => {
    let finish: () => void = () => undefined;
    const onConfirm = vi.fn(() => new Promise<undefined>((resolve) => (finish = () => resolve(undefined))));
    const { user } = setup(onConfirm);
    await user.type(screen.getByLabelText('Reason'), 'A perfectly good reason');
    const button = screen.getByRole('button', { name: 'Suspend' });
    await user.dblClick(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    finish();
  });
});
