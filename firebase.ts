import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyCPj6BTD8VphsNWNyw82gQIqk44Q6fWyAc",
    authDomain: "loopgenie-5c4cf.firebaseapp.com",
    projectId: "loopgenie-5c4cf",
    storageBucket: "loopgenie-5c4cf.firebasestorage.app",
    messagingSenderId: "199654284948",
    appId: "1:199654284948:web:1f8547eb5ce55e31fc9e81",
    measurementId: "G-CK0KNMR04G"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Enable Offline Persistence
if (typeof window !== 'undefined') {
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code === 'failed-precondition') {
            // Multiple tabs open, persistence can only be enabled in one tab at a a time.
            console.warn('Firestore persistence failed-precondition');
        } else if (err.code === 'unimplemented') {
            // The current browser does not support all of the features required to enable persistence
            console.warn('Firestore persistence unimplemented');
        }
    });
}

export const isFirebaseConfigured = () => !!firebaseConfig.apiKey;
