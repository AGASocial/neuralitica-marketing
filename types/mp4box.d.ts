declare module "mp4box" {
  export interface MP4Info {
    duration?: number;
    timescale?: number;
  }

  export interface MP4File {
    onReady?: (info: MP4Info) => void;
    onError?: (error: unknown) => void;
    appendBuffer: (buffer: ArrayBuffer & { fileStart?: number }) => void;
    flush: () => void;
  }

  interface MP4BoxModule {
    createFile: () => MP4File;
  }

  const MP4Box: MP4BoxModule;
  export default MP4Box;
}
