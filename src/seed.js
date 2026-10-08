// Demo data so judges see a living platform. Run: npm run seed  (password for all: demo1234)
const bcrypt = require('bcryptjs');
const db = require('./db');
if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0 && !process.argv.includes('--force')) {
  console.log('DB already has users. Use --force to add demo users anyway.'); process.exit(0);
}
const hash = bcrypt.hashSync('demo1234', 10);
const J = (a) => JSON.stringify(a);
const users = [
  ['Aarav Mehta','aarav@demo.in','professional','Google India','Senior Software Engineer','10 yrs in backend & system design. I help students crack interviews and build real projects.','https://linkedin.com/in/demo-aarav',['System Design','Data Structures','Backend (Node.js)','Interview Prep'],['Public Speaking'],1],
  ['Neha Sharma','neha@demo.in','professional','Razorpay','Product Designer','UI/UX for fintech. Portfolio reviews and Figma deep dives.','https://linkedin.com/in/demo-neha',['UI/UX Design','Figma','Portfolio Review'],['Python'],1],
  ['Rohan Verma','rohan@demo.in','professional','Zomato','Data Scientist','ML in production, SQL, and analytics careers.','',['Machine Learning','SQL','Data Analytics','Python'],['UI/UX Design'],1],
  ['Ananya Singh','ananya@demo.ac.in','student','Shaheed Rajguru College, DU','BCA 3rd year | Web dev & hackathons','Won 3 hackathons. Happy to teach React and Git basics.','',['React','Git & GitHub','Web Development','Hackathon Strategy'],['Machine Learning','System Design'],1],
  ['Kabir Khan','kabir@demo.ac.in','student','IIT Delhi','B.Tech CSE | Competitive programmer','Codeforces specialist. I teach DSA from zero.','',['Data Structures','C++','Competitive Programming'],['UI/UX Design','Public Speaking'],1],
  ['Priya Nair','priya@demo.ac.in','student','Miranda House, DU','B.Sc Maths | Data enthusiast','Excel, statistics and data viz tutor.','',['Statistics','Excel','Data Visualization'],['React','Git & GitHub'],1],
  ['Vikram Rao','vikram@demo.in','professional','Microsoft','Cloud Engineer','Azure, DevOps and cloud careers.','',['Cloud (Azure)','DevOps','Docker'],['Public Speaking'],1],
  ['Simran Kaur','simran@demo.ac.in','student','Delhi Technological University','B.Tech ECE | Embedded & IoT','Arduino, ESP32 and PCB design for beginners.','',['IoT','Arduino','ESP32','Embedded C'],['Web Development'],1],
];
const ins = db.prepare(`INSERT INTO users(name,email,pass_hash,role,org,headline,bio,linkedin,teach,learn,verified,xp) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
const slot = db.prepare('INSERT INTO slots(user_id,start_ts,duration) VALUES(?,?,?)');
const tx = db.transaction(() => {
  users.forEach((u, i) => {
    const id = ins.run(u[0],u[1],hash,u[2],u[3],u[4],u[5],u[6],J(u[7]),J(u[8]),u[9], 40 + i * 35).lastInsertRowid;
    for (let d = 1; d <= 4; d++) for (const h of [11, 17]) {
      const t = new Date(); t.setDate(t.getDate() + d); t.setHours(h, 0, 0, 0);
      slot.run(id, t.toISOString(), 30);
    }
  });
  db.prepare('INSERT INTO requests(user_id,skill,details) VALUES(?,?,?)').run(4,'Machine Learning','Need a beginner-friendly intro, 2-3 sessions before the hackathon.');
  db.prepare('INSERT INTO requests(user_id,skill,details) VALUES(?,?,?)').run(5,'Public Speaking','Have to pitch at the finale. Looking for a quick coaching session.');
});
tx();
console.log('Seeded', users.length, 'demo users. Login e.g. ananya@demo.ac.in / demo1234');
