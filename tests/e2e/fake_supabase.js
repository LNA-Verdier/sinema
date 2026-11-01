// Faux supabase-js pour les tests : base en mémoire, mêmes appels que ceux utilisés par Sinema.
// Les tests peuvent préparer la base avec window.__SEED (avant le chargement) et la lire avec window.__db.
const seed = window.__SEED || {};
const db = {
  rooms: seed.rooms || [{ id:"room-1", code:"ABCD2345", name:"Canapé" }],
  members: seed.members || [{ room_id:"room-1", user_id:"u_her", name:"Camille", joined_at:"1", avatar:{ b:"alien", c:6, head:"crown" } }],
  user_swipes: seed.user_swipes || [
    { user_id:"u_her", movie_id:3, verdict:"like", movie:{ id:3, title:"Film Trois", year:"2020", poster:"/p3.jpg", genres:["Drame"], vote:7.1, overview:"Résumé." } },
    { user_id:"u_her", movie_id:2, verdict:"seen", movie:{ id:2, title:"Film Deux", year:"2019", poster:"/p2.jpg", genres:["Comédie"], vote:6.5 } },
  ],
  watched: seed.watched || [],
};
const listeners = [];
window.__db = db;
window.__rpc = [];
window.__logged = !!seed.logged;
window.__netDown = false; // true : les écritures échouent comme sans réseau
window.__emit = (table, eventType, row) => listeners.filter(l => l.table === table).forEach(l => l.cb({ eventType, new:row, old:row }));
const NET = { message:"TypeError: Failed to fetch" };
const clone = x => JSON.parse(JSON.stringify(x));

function q(table){
  const filters = []; let embed = false;
  const run = () => {
    let rows = db[table].filter(r => filters.every(f => f(r)));
    if (embed) rows = rows.map(r => ({ ...r, rooms: db.rooms.find(x => x.id === r.room_id) }));
    return { data: clone(rows), error: null };
  };
  const pk = table === "user_swipes" ? ["user_id","movie_id"] : ["room_id","movie_id"];
  const put = row => { const i = db[table].findIndex(r => pk.every(k => r[k] === row[k])); if (i > -1) db[table][i] = { ...db[table][i], ...row }; else db[table].push({ ...row }); };
  const api = {
    select(c){ if (c && c.includes("rooms(")) embed = true; return api; },
    eq(k, v){ filters.push(r => r[k] === v); return api; },
    in(k, vs){ filters.push(r => vs.includes(r[k])); return api; },
    order(){ return api; }, limit(){ return api; },
    then(res, rej){ return Promise.resolve(run()).then(res, rej); },
    upsert(rows){
      if (window.__netDown) return Promise.resolve({ error: NET });
      (Array.isArray(rows) ? rows : [rows]).forEach(put);
      return Promise.resolve({ error: null });
    },
    delete(){ return { match(m){
      if (window.__netDown) return Promise.resolve({ error: NET });
      db[table] = db[table].filter(r => !Object.entries(m).every(([k, v]) => r[k] === v)); return Promise.resolve({ error: null });
    } }; },
  };
  return api;
}

export function createClient(){
  const sess = { access_token:"test-access-token", user:{ id:"u_me", email:"lolo@test.fr", user_metadata:{ name:"Lolo" } } };
  return {
    auth: {
      getSession: async () => ({ data:{ session: window.__logged ? sess : null } }),
      signUp: async o => { window.__signup = o; return { data:{ session:null, user:{ identities:[{}] } }, error:null }; },
      signInWithPassword: async ({ password }) => password === "bonmotdepasse1"
        ? (window.__logged = true, { data:{ session:sess }, error:null })
        : { data:{}, error:{ message:"Invalid login credentials" } },
      resend: async () => ({ error:null }), resetPasswordForEmail: async () => ({ error:null }),
      updateUser: async o => { (window.__updates ||= []).push(o); return { data:{}, error:null }; },
      reauthenticate: async () => ({ error:null }),
      signOut: async () => { window.__logged = false; return { error:null }; },
    },
    rpc: async (fn, a) => {
      window.__rpc.push([fn, a]);
      if (fn === "create_room"){
        const code = "NEWR" + (db.rooms.length + 1) + "ABC", id = "room-" + (db.rooms.length + 1);
        db.rooms.push({ id, code, name:a.p_room_name }); db.members.push({ room_id:id, user_id:"u_me", name:a.p_name, joined_at:"9" });
        return { data:code, error:null };
      }
      if (fn === "join_room"){
        const r = db.rooms.find(x => x.code === a.p_code); if (!r) return { data:null, error:null };
        if (!db.members.some(m => m.user_id === "u_me" && m.room_id === r.id)) db.members.push({ room_id:r.id, user_id:"u_me", name:a.p_name, joined_at:"5" });
        return { data:r.id, error:null };
      }
      if (fn === "rename_room"){ db.rooms.find(x => x.id === a.p_room).name = a.p_room_name; return { error:null }; }
      if (fn === "set_profile"){ db.members.filter(m => m.user_id === "u_me").forEach(m => { m.name = a.p_name; m.avatar = a.p_avatar; }); return { error:null }; }
      if (fn === "leave_room"){ db.members = db.members.filter(m => !(m.room_id === a.p_room && m.user_id === "u_me")); return { error:null }; }
      return { error:null };
    },
    from: q, removeChannel(){},
    channel(){ const ch = { on(_, o, cb){ listeners.push({ table:o.table, cb }); return ch; }, subscribe(){ return ch; } }; return ch; },
  };
}
