// Prints a VAPID key pair. Put them in env vars VAPID_PUBLIC / VAPID_PRIVATE on your host.
import webpush from 'web-push';

const k = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC=${k.publicKey}\nVAPID_PRIVATE=${k.privateKey}`);
