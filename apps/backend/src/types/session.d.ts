/**
 * ขยายประเภท session ของ express-session (NFR-05)
 * — req.session.userId ใช้ใน routes + socket.io middleware
 * (ต้องเป็น module file เพื่อให้ declare module ทำงานแบบ augmentation ไม่ใช่ ambient shadow)
 */
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    /** id ผู้ใช้ที่ล็อกอิน — undefined = ยังไม่ได้ล็อกอิน */
    userId?: number;
  }
}

/**
 * express-session middleware (app.ts) เติม req.session ให้ทุก request ก่อนถึง routes/socket.io
 * (socket.io ให้ socket.request เป็น http.IncomingMessage — middleware ทำงานบน http server เดียวกัน)
 */
declare module 'http' {
  interface IncomingMessage {
    session: import('express-session').Session & Partial<import('express-session').SessionData>;
  }
}
