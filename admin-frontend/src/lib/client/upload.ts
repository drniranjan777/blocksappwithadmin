import { ApiError } from './api';

export interface SignedUpload {
  url: string;
  headers: Record<string, string>;
}

/**
 * Sends a file straight to the address the API signed for it (object storage), reporting progress.
 *
 * The signature covers the file type and size, so the headers must be sent exactly as given. The page's
 * security policy allows this only for the storage address listed in `UPLOAD_ORIGINS`.
 */
export function uploadToSigned(
  target: SignedUpload,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', target.url);
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(
          new ApiError(
            xhr.status,
            'UPLOAD_FAILED',
            'The file could not be uploaded. Check its type and size and try again.',
          ),
        );
    };
    xhr.onerror = () =>
      reject(new ApiError(0, 'NETWORK', 'The upload was interrupted. Check your connection and try again.'));
    xhr.send(file);
  });
}
