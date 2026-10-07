// Usage: npm run create-admin -- <email>   (the login must already exist)
import "dotenv/config";
import { prisma } from "../lib/db";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run create-admin -- <email>");
  process.exit(1);
}
const n = await prisma.user.updateMany({ where: { email }, data: { isAdmin: true } });
console.log(n.count ? `${email} is now an admin` : `No account found for ${email}; sign up first`);
await prisma.$disconnect();
process.exit(n.count ? 0 : 1);
