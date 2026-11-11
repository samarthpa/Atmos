export async function saveDemoDocument(id: string, file: File) {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("atmos-hotelify-documents", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onerror = () => reject(Error("Document storage is unavailable"));
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(file, id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(Error("Could not save document"));
      };
    };
  });
}
export async function openDemoDocument(id: string) {
  const file = await new Promise<Blob>((resolve, reject) => {
    const req = indexedDB.open("atmos-hotelify-documents", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onerror = () => reject(Error("Document storage unavailable"));
    req.onsuccess = () => {
      const db = req.result;
      const get = db.transaction("files").objectStore("files").get(id);
      get.onsuccess = () => {
        db.close();
        get.result
          ? resolve(get.result)
          : reject(
              Error("This demo document is not available in this browser"),
            );
      };
      get.onerror = () => reject(Error("Could not read document"));
    };
  });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
