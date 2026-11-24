import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthAndProfile } from '../pages/AuthAndProfile';
import { AuthProvider } from '../context/AuthContext';
import { I18nProvider } from '../i18n/I18nContext';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
  api: {
    auth: {
      login: vi.fn(),
      register: vi.fn(),
      getMe: vi.fn(),
      updateMe: vi.fn(),
      logout: vi.fn(),
    },
  },
}));

describe('AuthAndProfile Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders login form by default when not logged in', async () => {
    (api.auth.getMe as any).mockRejectedValue(new Error('Unauthenticated'));

    render(
      <I18nProvider>
        <AuthProvider>
          <AuthAndProfile />
        </AuthProvider>
      </I18nProvider>
    );

    await waitFor(() => {
      const signInBtns = screen.getAllByRole('button', { name: 'Sign In' });
      expect(signInBtns.length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText('trader@example.com')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    });
  });

  it('switches to create account registration form with scheme and language selectors', async () => {
    (api.auth.getMe as any).mockRejectedValue(new Error('Unauthenticated'));

    render(
      <I18nProvider>
        <AuthProvider>
          <AuthAndProfile />
        </AuthProvider>
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Create Account')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create Account'));

    expect(screen.getByPlaceholderText('e.g. Krishna Kirana Store')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('07AAAAA0000A1Z5')).toBeInTheDocument();
    expect(screen.getByText('Regular')).toBeInTheDocument();
  });

  it('displays business profile and allows saving settings when user is logged in', async () => {
    localStorage.setItem('khatagst_token', 'mock-valid-token');
    (api.auth.getMe as any).mockResolvedValue({
      id: 1,
      email: 'trader@example.com',
      business_name: 'Aggarwal Stores',
      gstin: '07AAAAA0000A1Z5',
      state_code: '07',
      scheme: 'REGULAR',
      language: 'en',
    });

    render(
      <I18nProvider>
        <AuthProvider>
          <AuthAndProfile />
        </AuthProvider>
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Business Profile')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Aggarwal Stores')).toBeInTheDocument();
      expect(screen.getByDisplayValue('07AAAAA0000A1Z5')).toBeInTheDocument();
      expect(screen.getByDisplayValue('07')).toBeInTheDocument();
    });

    (api.auth.updateMe as any).mockResolvedValue({
      id: 1,
      email: 'trader@example.com',
      business_name: 'Aggarwal & Sons',
      gstin: '07AAAAA0000A1Z5',
      state_code: '07',
      scheme: 'REGULAR',
      language: 'en',
    });

    const nameInput = screen.getByDisplayValue('Aggarwal Stores');
    fireEvent.change(nameInput, { target: { value: 'Aggarwal & Sons' } });

    const saveBtn = screen.getByRole('button', { name: /Save Profile Settings/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.auth.updateMe).toHaveBeenCalledWith(
        expect.objectContaining({
          business_name: 'Aggarwal & Sons',
        })
      );
      expect(screen.getByText(/Business profile updated successfully!/i)).toBeInTheDocument();
    });
  });
});
