import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, where } from "firebase/firestore";
import { storage, db } from "./firebase";
import { StoredFile, Voter } from "../types";

/**
 * Uploads PDF and Generated CSV to Firebase Storage
 * Syncs Metadata to Firestore
 */
export const syncFileToCloud = async (
  userId: string,
  pdfFile: File,
  voters: Voter[],
  csvContent: string
): Promise<void> => {
  const timestamp = Date.now();
  const assembly = voters[0]?.assembly_name || "Unknown";
  const safeFileName = pdfFile.name.replace(/[^a-zA-Z0-9.-]/g, "_");

  // 1. Upload Original PDF
  const pdfRef = ref(storage, `user_uploads/${userId}/${timestamp}_${safeFileName}`);
  await uploadBytes(pdfRef, pdfFile);
  const pdfUrl = await getDownloadURL(pdfRef);

  // 2. Upload Extracted CSV Data
  const csvBlob = new Blob([csvContent], { type: 'text/csv' });
  const csvRef = ref(storage, `user_uploads/${userId}/${timestamp}_${safeFileName}.csv`);
  await uploadBytes(csvRef, csvBlob);
  const csvUrl = await getDownloadURL(csvRef);

  // 3. Save Metadata to Firestore
  // Path: /users/{uid}/files/{fileId}
  const filesCollection = collection(db, `users/${userId}/files`);
  await addDoc(filesCollection, {
    fileName: pdfFile.name,
    pdfUrl: pdfUrl,
    csvUrl: csvUrl,
    voterCount: voters.length,
    assembly: assembly,
    createdAt: new Date().toISOString(),
    notes: `Extracted ${voters.length} voters from ${assembly}.`
  });
};

/**
 * Fetches user's upload history from Firestore
 */
export const getUserHistory = async (userId: string): Promise<StoredFile[]> => {
  const filesCollection = collection(db, `users/${userId}/files`);
  // Order by createdAt descending (newest first)
  const q = query(filesCollection, orderBy("createdAt", "desc"));
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as StoredFile));
};

/**
 * Deletes a file record from history and associated storage files
 */
export const deleteUserFile = async (userId: string, file: StoredFile): Promise<void> => {
  // 1. Delete Metadata Doc
  await deleteDoc(doc(db, `users/${userId}/files`, file.id));

  // 2. Delete from Storage (Best effort, catch errors if files already gone)
  try {
    const pdfRef = ref(storage, file.pdfUrl);
    await deleteObject(pdfRef);
  } catch (e) { console.warn("Could not delete PDF from storage", e); }

  try {
    const csvRef = ref(storage, file.csvUrl);
    await deleteObject(csvRef);
  } catch (e) { console.warn("Could not delete CSV from storage", e); }
};
