/**
 * Seeds demo members so the listing, matching and search pages have data.
 *   npm run seed
 * Every demo account uses the password: Demo@123
 */
const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');

const FEMALE = ['Priya', 'Sneha', 'Anjali', 'Kavita', 'Meera', 'Divya', 'Pooja', 'Rutuja'];
const MALE = ['Rahul', 'Amit', 'Nikhil', 'Sagar', 'Omkar', 'Vikram', 'Rohan', 'Aditya'];
const SURNAMES = ['Sharma', 'Patil', 'Deshmukh', 'Joshi', 'Kulkarni', 'Verma', 'Jadhav', 'Gupta'];

const PLACES = [
  { city: 'Pune', district: 'Pune', state: 'Maharashtra', pinCode: '411001' },
  { city: 'Mumbai', district: 'Mumbai Suburban', state: 'Maharashtra', pinCode: '400001' },
  { city: 'Nashik', district: 'Nashik', state: 'Maharashtra', pinCode: '422001' },
  { city: 'Nagpur', district: 'Nagpur', state: 'Maharashtra', pinCode: '440001' },
  { city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pinCode: '560001' },
  { city: 'Ahmedabad', district: 'Ahmedabad', state: 'Gujarat', pinCode: '380001' },
  { city: 'Jaipur', district: 'Jaipur', state: 'Rajasthan', pinCode: '302001' },
  { city: 'Indore', district: 'Indore', state: 'Madhya Pradesh', pinCode: '452001' },
];

const JOBS = ['Software Engineer', 'Doctor', 'Chartered Accountant', 'Teacher', 'Bank Manager', 'Architect', 'Business Owner', 'Civil Engineer'];
const CASTES = ['Maratha', 'Brahmin', 'Agarwal', 'Rajput', 'Patel', 'Jain'];

const pick = (list, index) => list[index % list.length];

/**
 * Demo photos.
 * Deterministic placeholder images so seeded members satisfy the
 * "profile picture + MIN_GALLERY_PHOTOS" rule and appear in listings.
 */
const avatarUrl = (name, size = 400) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=${size}&background=db2777&color=fff&bold=true`;

const galleryFor = (name, count) =>
  Array.from({ length: count }, (_, slot) => ({
    url: `https://picsum.photos/seed/${encodeURIComponent(`${name}-${slot}`)}/600/600`,
    uploadedAt: new Date(),
  }));

async function seed() {
  await connectDB();

  const total = 24;
  let created = 0;

  for (let index = 0; index < total; index += 1) {
    const isFemale = index % 2 === 0;
    const first = isFemale ? pick(FEMALE, index / 2) : pick(MALE, (index - 1) / 2);
    const surname = pick(SURNAMES, index * 3);
    const place = pick(PLACES, index);
    const age = 24 + (index % 10);

    const email = `${first.toLowerCase()}.${surname.toLowerCase()}${index}@example.com`;

    // eslint-disable-next-line no-await-in-loop
    if (await User.exists({ email })) continue;

    // eslint-disable-next-line no-await-in-loop
    await User.create({
      name: `${first} ${surname}`,
      email,
      phone: `9${String(800000000 + index * 137).slice(0, 9)}`,
      password: 'Demo@123',
      gender: isFemale ? 'female' : 'male',
      dateOfBirth: new Date(new Date().getFullYear() - age, index % 12, (index % 27) + 1),
      height: isFemale ? 152 + (index % 12) : 165 + (index % 15),
      maritalStatus: 'never_married',
      religion: 'hindu',
      caste: pick(CASTES, index),
      motherTongue: index % 3 === 0 ? 'Hindi' : 'Marathi',
      diet: pick(['vegetarian', 'non_vegetarian', 'eggetarian'], index),
      qualification: pick(['bachelors', 'masters', 'doctorate'], index),
      occupation: pick(JOBS, index),
      annualIncome: 600000 + index * 75000,
      address: `${100 + index}, Green Residency`,
      city: place.city,
      district: place.district,
      state: place.state,
      pinCode: place.pinCode,
      fatherName: `${pick(MALE, index + 5)} ${surname}`,
      motherName: `${pick(FEMALE, index + 3)} ${surname}`,
      siblings: index % 3,
      about: `${first} is a ${age}-year-old ${pick(JOBS, index).toLowerCase()} based in ${place.city}. The family values honesty, education and a warm home, and is looking for a caring, well-educated life partner.`,
      photo: avatarUrl(`${first} ${surname}`),
      gallery: galleryFor(`${first}-${surname}-${index}`, env.upload.minGalleryPhotos),
      preferences: { theme: 'system', language: index % 3 === 0 ? 'hi' : index % 3 === 1 ? 'mr' : 'en' },
      partnerPreference: {
        ageMin: isFemale ? age : age - 5,
        ageMax: isFemale ? age + 6 : age,
        religion: 'hindu',
        state: place.state,
        maritalStatus: 'never_married',
      },
      // Demo members are already through the funnel so they show up in listings.
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      isPaid: true,
      paidAt: new Date(),
    });

    created += 1;
  }

  console.log(`Seed complete — ${created} new demo members created (password: Demo@123).`);
  await disconnectDB();
  process.exit(0);
}

seed().catch(async (error) => {
  console.error('Seed failed:', error.message);
  await disconnectDB();
  process.exit(1);
});
