// src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      // Overrides navigator.locks to prevent acquisition timeouts
      lock: async (_name, _acquireTimeout, fn) => {
        return await fn()
      },
    },
  }
)