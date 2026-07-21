import { closeDb, db } from "../src/database.js";
import { hashPassword } from "../src/auth.js";

const ids = {
  organization: "11111111-1111-4111-8111-111111111111",
  administrator: "11111111-1111-4111-8111-111111111112",
  role: "11111111-1111-4111-8111-111111111113",
  asset: "22222222-2222-4222-8222-222222222221",
  vessel: "33333333-3333-4333-8333-333333333331",
  person: "44444444-4444-4444-8444-444444444441",
  competency: "55555555-5555-4555-8555-555555555551",
  pob: "66666666-6666-4666-8666-666666666661",
  activity: "77777777-7777-4777-8777-777777777771"
} as const;

async function seed() {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const passwordHash = await hashPassword("OceanCommandDemo!2026");
    await client.query("INSERT INTO organizations (id,name,slug,timezone,settings) VALUES ($1,'Ocean Command Demo','ocean-demo','America/Sao_Paulo','{\"dataMode\":\"SIMULATED\"}') ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, settings=EXCLUDED.settings", [ids.organization]);
    await client.query("INSERT INTO users (id,organization_id,name,email,password_hash,status) VALUES ($1,$2,'Demo Administrator','demo@ocean-command.local',$3,'ACTIVE') ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash,status='ACTIVE'", [ids.administrator, ids.organization, passwordHash]);
    await client.query("INSERT INTO roles (id,organization_id,name,system_role) VALUES ($1,$2,'Administrator','ADMINISTRATOR') ON CONFLICT (organization_id,system_role) DO NOTHING", [ids.role, ids.organization]);
    await client.query("INSERT INTO user_roles (user_id,role_id) SELECT $1,id FROM roles WHERE organization_id=$2 AND system_role='ADMINISTRATOR' ON CONFLICT DO NOTHING", [ids.administrator, ids.organization]);
    await client.query("INSERT INTO offshore_assets (id,organization_id,name,code,type,status,latitude,longitude,timezone,operator,description,metadata) VALUES ($1,$2,'FPSO Aurora','FPSO-AURORA','FPSO','ACTIVE',-22.318,-40.098,'America/Sao_Paulo','Ocean Command Demo','Simulated offshore production unit for local demonstrations.','{\"dataMode\":\"SIMULATED\"}') ON CONFLICT (organization_id,code) DO UPDATE SET status=EXCLUDED.status,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,metadata=EXCLUDED.metadata", [ids.asset, ids.organization]);
    await client.query("INSERT INTO vessels (id,organization_id,name,imo,mmsi,type,status,capacity,operator,metadata) VALUES ($1,$2,'MV Atlantic Support','9876543','710123456','PSV','UNDERWAY',42,'Ocean Command Demo','{\"dataMode\":\"SIMULATED\"}') ON CONFLICT (organization_id,imo) DO UPDATE SET status=EXCLUDED.status,metadata=EXCLUDED.metadata", [ids.vessel, ids.organization]);
    await client.query("INSERT INTO vessel_positions (id,vessel_id,latitude,longitude,speed,course,heading,navigation_status,source,accuracy,recorded_at) SELECT '33333333-3333-4333-8333-333333333332',$1,-22.147,-40.512,11.2,72,72,'UNDERWAY','SIMULATOR',25,now() WHERE NOT EXISTS (SELECT 1 FROM vessel_positions WHERE vessel_id=$1)", [ids.vessel]);
    await client.query("INSERT INTO people (id,organization_id,name,employee_code,company,position,status,contact) VALUES ($1,$2,'Ana Costa','OC-1001','Ocean Command Demo','Marine Coordinator','ACTIVE','{\"dataMode\":\"SIMULATED\"}') ON CONFLICT (organization_id,employee_code) DO NOTHING", [ids.person, ids.organization]);
    await client.query("INSERT INTO competencies (id,organization_id,code,name,validity_required) VALUES ($1,$2,'BOSIET','BOSIET','true') ON CONFLICT (organization_id,code) DO NOTHING", [ids.competency, ids.organization]);
    await client.query("INSERT INTO person_competencies (id,person_id,competency_id,issued_at,expires_at,issuer,status) SELECT '55555555-5555-4555-8555-555555555552',$1,$2,CURRENT_DATE - INTERVAL '1 year',CURRENT_DATE + INTERVAL '1 year','Ocean Command Demo','VALID' WHERE NOT EXISTS (SELECT 1 FROM person_competencies WHERE person_id=$1 AND competency_id=$2)", [ids.person, ids.competency]);
    await client.query("INSERT INTO people_on_board (id,person_id,asset_id,embarked_at,expected_disembark_at,status,cabin,shift) SELECT $1,$2,$3,now() - INTERVAL '2 days',now() + INTERVAL '12 days','ON_BOARD','A-12','DAY' WHERE NOT EXISTS (SELECT 1 FROM people_on_board WHERE person_id=$2 AND status='ON_BOARD')", [ids.pob, ids.person, ids.asset]);
    await client.query("INSERT INTO operational_activities (id,organization_id,asset_id,title,type,priority,status,risk_level,planned_start,planned_end,progress,metadata) VALUES ($1,$2,$3,'Simulated supply transfer','LOGISTICS','HIGH','PLANNED','MEDIUM',now() + INTERVAL '1 hour',now() + INTERVAL '4 hours',0,'{\"dataMode\":\"SIMULATED\"}') ON CONFLICT (id) DO NOTHING", [ids.activity, ids.organization, ids.asset]);
    await client.query("COMMIT");
    console.log("Simulated demo data is ready. Sign in with demo@ocean-command.local / OceanCommandDemo!2026");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await closeDb();
  }
}

void seed();
