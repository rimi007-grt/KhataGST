import {
  AuthResponse,
  Document,
  ExtractDocumentResponse,
  ExtractedEntryOut,
  EntryReviewed,
  EntryCreate,
  EntryUpdate,
  User,
  UserUpdate,
  ValidationResponse,
  ValidationSummaryOut,
  ValidationCountsOut,
  DashboardResponse
} from '../types';

const envApiUrl = (((import.meta as any)?.env?.VITE_API_URL) as string | undefined)?.trim();
export const BASE_URL = envApiUrl
  ? (envApiUrl.endsWith('/api/v1') ? envApiUrl : `${envApiUrl.replace(/\/+$/, '')}/api/v1`)
  : '/api/v1';

type ColdStartListener = (isColdStarting: boolean) => void;
const coldStartListeners = new Set<ColdStartListener>();

export const onColdStartChange = (callback: ColdStartListener) => {
  coldStartListeners.add(callback);
  return () => {
    coldStartListeners.delete(callback);
  };
};

function notifyColdStart(status: boolean) {
  coldStartListeners.forEach((cb) => cb(status));
}

export class ApiError extends Error {
  code?: string;
  status: number;
  details?: any;

  constructor(message: string, status: number, code?: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('khatagst_token');
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Only set Content-Type to JSON if body is not FormData
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Detect cold start: if request takes > 3000ms, trigger friendly waking up banner
  let isDone = false;
  const coldStartTimer = setTimeout(() => {
    if (!isDone) {
      notifyColdStart(true);
    }
  }, 3000);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers
    });
  } catch (err: any) {
    clearTimeout(coldStartTimer);
    notifyColdStart(false);

    // Friendly cold-start / network error handling without raw technical error
    throw new ApiError(
      "Unable to connect to the KhataGST server. The server may be waking up, please wait a moment and retry.",
      0,
      "SERVER_UNREACHABLE"
    );
  } finally {
    isDone = true;
    clearTimeout(coldStartTimer);
    notifyColdStart(false);
  }

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: response.statusText };
    }

    const detail = errorData.detail || errorData;
    let message = 'An error occurred';
    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail
        .map((d: any) => {
          const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : '';
          return field ? `${field}: ${d.msg}` : d.msg;
        })
        .join(', ');
    } else if (typeof detail === 'object') {
      message = detail?.message || errorData.message || 'An error occurred';
    }

    if (response.status === 401) {
      message = 'Please log in or create an account to view your dashboard.';
    } else if (response.status === 404) {
      message = 'Backend API not reachable. Please ensure VITE_API_URL is configured in your Render settings.';
    }

    const code = typeof detail === 'object' && !Array.isArray(detail) ? detail?.code : undefined;
    const details = typeof detail === 'object' && !Array.isArray(detail) ? detail?.details : undefined;

    throw new ApiError(message, response.status, code, details);
  }

  // Handle empty or file responses
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }

  return response as unknown as T;
}

export const api = {
  auth: {
    login: async (email: string, password: string): Promise<AuthResponse> => {
      const res = await request<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (res.access_token) {
        localStorage.setItem('khatagst_token', res.access_token);
      }
      return res;
    },

    register: async (data: {
      email: string;
      password: string;
      business_name?: string;
      gstin?: string;
      state_code?: string;
      scheme: string;
      language: string;
    }): Promise<AuthResponse> => {
      const res = await request<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      if (res.access_token) {
        localStorage.setItem('khatagst_token', res.access_token);
      }
      return res;
    },

    getMe: async (): Promise<User> => {
      return request<User>('/me');
    },

    updateMe: async (data: UserUpdate): Promise<User> => {
      return request<User>('/me', {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },

    logout: () => {
      localStorage.removeItem('khatagst_token');
    }
  },

  documents: {
    upload: async (file: File, docType: string): Promise<Document> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('doc_type', docType);

      return request<Document>('/documents', {
        method: 'POST',
        body: formData
      });
    },

    extract: async (documentId: number): Promise<ExtractDocumentResponse> => {
      return request<ExtractDocumentResponse>(`/documents/${documentId}/extract`, {
        method: 'POST'
      });
    },

    getEntries: async (documentId: number): Promise<ExtractedEntryOut[]> => {
      return request<ExtractedEntryOut[]>(`/documents/${documentId}/entries`);
    }
  },

  entries: {
    list: async (period?: string): Promise<EntryReviewed[]> => {
      const q = period ? `?period=${encodeURIComponent(period)}` : '';
      return request<EntryReviewed[]>(`/entries${q}`);
    },

    create: async (data: EntryCreate): Promise<EntryReviewed> => {
      return request<EntryReviewed>('/entries', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    update: async (id: number, data: EntryUpdate): Promise<EntryReviewed> => {
      return request<EntryReviewed>(`/entries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },

    seedDemo: async (period?: string): Promise<EntryReviewed[]> => {
      const q = period ? `?period=${encodeURIComponent(period)}` : '';
      return request<EntryReviewed[]>(`/entries/seed-demo${q}`, {
        method: 'POST'
      });
    }
  },

  validation: {
    validate: async (period?: string): Promise<ValidationResponse> => {
      return request<ValidationResponse>('/validate', {
        method: 'POST',
        body: JSON.stringify({ period: period || null })
      });
    },

    summary: async (period?: string): Promise<ValidationSummaryOut> => {
      const q = period ? `?period=${encodeURIComponent(period)}` : '';
      return request<ValidationSummaryOut>(`/validation/summary${q}`);
    },

    counts: async (period?: string): Promise<ValidationCountsOut> => {
      const q = period ? `?period=${encodeURIComponent(period)}` : '';
      return request<ValidationCountsOut>(`/validation/counts${q}`);
    }
  },

  export: {
    download: async (
      period?: string,
      format: 'xlsx' | 'json' = 'xlsx',
      deleteSourceImages: boolean = false
    ): Promise<{ filename: string; blob?: Blob; data?: any }> => {
      const token = localStorage.getItem('khatagst_token');
      const params = new URLSearchParams();
      if (period) params.append('period', period);
      params.append('format', format);
      params.append('delete_source_images', String(deleteSourceImages));

      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${BASE_URL}/export?${params.toString()}`, {
        headers
      });

      if (!res.ok) {
        let errJson: any = {};
        try {
          errJson = await res.json();
        } catch {
          errJson = { message: res.statusText };
        }
        const detail = errJson.detail || errJson;
        const msg = typeof detail === 'string' ? detail : detail?.message || 'Export failed';
        const code = typeof detail === 'object' ? detail?.code : undefined;
        throw new ApiError(msg, res.status, code, typeof detail === 'object' ? detail?.details : undefined);
      }

      const disposition = res.headers.get('Content-Disposition');
      let filename = `khata_export_${period || 'all'}.${format}`;
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      if (format === 'xlsx') {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        return { filename, blob };
      } else {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        return { filename, data };
      }
    }
  },
  dashboard: {
    get: (period?: string) =>
      request<DashboardResponse>(`/dashboard${period ? `?period=${encodeURIComponent(period)}` : ''}`)
  }
};

