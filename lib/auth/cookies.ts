export const staffCookieName = process.env.NODE_ENV === 'production' ? '__Host-rms_staff_token' : 'rms_staff_token'

export const authCookieOptions = {
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}
