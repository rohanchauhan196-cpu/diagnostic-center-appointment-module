import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRO_NAMES = [
  "Ajay Bharat Labs",
  "Akhil (Molecular)",
  "Amit Mishra PRO",
  "Anuj Gupta PRO",
  "AOHC",
  "Ashish PRO",
  "Aviral Gupta Sir (Molecular)",
  "Avinash PRO",
  "Bharat Lab PRO",
  "Brahamdev PRO",
  "Brajesh PRO",
  "DAK",
  "Deen Dayal Arun PRO",
  "Nikunj Jain",
  "Nitin Leekha",
  "Surender Kumar Dabas (JAMC)",
  "DSCI",
  "EBML",
  "ESI",
  "Eve Healthcare",
  "Foundation Coupon(7500)",
  "Harish PRO",
  "Irshad (Molecular)",
  "Jatin PRO",
  "Just Dial",
  "Khushboo PRO",
  "Krishna Kant Tripathi PRO",
  "Krishna Sir(Molecular)",
  "Lab Uncle",
  "Manipal Hospitals",
  "Manoj Sharma PRO",
  "Mihir PRO",
  "Mitali (Molecular)",
  "Mohit Gupta Sir (Molecular)",
  "Neeraj PRO",
  "Nitesh Kumar PRO",
  "NITRD",
  "Others (Not Available - NA)",
  "Pankaj PRO",
  "Pradeep PRO",
  "Praveen Sharma PRO",
  "Rakesh PRO",
  "Ravi Kumar PRO",
  "Redcliff",
  "SELF",
  "Shalimar - Lalita",
  "Shubham Jain (Molecular)",
  "Shyaam Nagar PRO",
  "SSS - Sachin Sarcoma Society",
  "Subodh PRO",
  "Sunil Joshi Sir (DDN - Molecular)",
  "Sunil Sir (GP - Molecular)",
  "Umesh Pandey PRO",
  "Vimal PRO",
  "Vipin (GP - Molecular)",
  "Vipin/Nitin PRO",
  "Vishal Sir (Molecular)",
  "Visit Health",
  "Rohit Ji - Dehradun",
  "Trilok Ji - Dehradun",
  "Anurag Ji - Jhansi (Gwalior)",
  "Carelan",
  "Gautam Sir (Gwalior)",
  "Guddu Kumar",
  "Kaushalendra Ji (Gwalior)",
  "Dinesh Verma PRO",
];

async function main() {
  console.log("Seeding PRO names...");
  for (const name of PRO_NAMES) {
    await prisma.proName.upsert({
      where: { name },
      update: {},
      create: { name, isCustom: false },
    });
  }
  console.log(`✅ Seeded ${PRO_NAMES.length} PRO names.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
