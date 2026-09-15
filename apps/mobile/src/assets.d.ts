/** Sounds bundled with the app: Metro hands back an asset number, which expo-audio plays. */
declare module '*.wav' {
  const asset: number;
  export default asset;
}
