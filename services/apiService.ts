
export const uploadPdfToCloud = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);

  // Sending to the Cloud Run endpoint
  // We assume the endpoint accepts a POST request with the file in 'file' field
  const response = await fetch('https://multiple-booth-pdf-to-csv-converter-840142183900.us-west1.run.app/', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Cloud Engine Error (${response.status}): ${errorText}`);
  }

  return await response.text();
};
