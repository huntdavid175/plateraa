/**
 * Where the API lives: the deployed one unless a development build is pointed at the laptop with
 * EXPO_PUBLIC_API_URL=http://<laptop IP>:3000 in apps/mobile/.env.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://plateraa-api.onrender.com';
