import { createClient } from "@supabase/supabase-js";

export class SupabaseOtpError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "SupabaseOtpError";
  }
}

function getSupabaseAuth() {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new SupabaseOtpError("SUPABASE_OTP_NOT_CONFIGURED");
  }

  // This client is used only for Supabase Auth. It does not read or write
  // application tables; InferPrompt continues to use MongoDB for its data.
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function sendSupabaseEmailOtp(email: string, name?: string, shouldCreateUser = true) {
  const { error } = await getSupabaseAuth().auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser,
      data: name ? { name } : undefined,
    },
  });

  if (error) throw new SupabaseOtpError(error.message, error.status);
}

export async function verifySupabaseEmailOtp(email: string, token: string) {
  const { data, error } = await getSupabaseAuth().auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error || !data.user) {
    throw new SupabaseOtpError(error?.message || "OTP could not be verified.", error?.status);
  }
}
