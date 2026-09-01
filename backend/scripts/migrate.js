require("dotenv").config();
const fs=require("fs");const path=require("path");const {Pool}=require("pg");
const url=process.env.DATABASE_URL;if(!url)throw new Error("DATABASE_URL is missing");
const pool=new Pool({connectionString:url,ssl:url.includes("render.com")?{rejectUnauthorized:false}:undefined});
(async()=>{try{for(const file of ["schema.sql","migration.sql","migration_saas.sql","migration_saas_v2.sql","migration_saas_v3.sql","migration_saas_v4.sql"]){const sql=fs.readFileSync(path.join(__dirname,"..","src","db",file),"utf8");console.log(`Applying ${file}...`);await pool.query(sql)}console.log("Database migration completed successfully.")}catch(e){console.error("Migration failed:",e);process.exitCode=1}finally{await pool.end()}})();
