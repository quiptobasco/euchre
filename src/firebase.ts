import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, doc, getDocFromServer } from "firebase/firestore";
import config from "../firebase-applet-config.json";

// Initialize Firebase
const app = initializeApp(config);

// Initialize Firestore with specific database ID if available
export const db = initializeFirestore(app, {}, config.firestoreDatabaseId || "(default)");

export const auth = getAuth(app);

// Validate Connection to Firestore as per guidelines
async function testConnection() {
  try {
    // Attempt to fetch from a dummy path to verify client network connection
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Please check your Firebase configuration or network status.");
    }
  }
}
testConnection();
