// Sinema · auth.js — Compte : inscription, connexion, mot de passe oublié, déconnexion.
import { $, HOME, LS, refreshSegs, sb, segSelectBy, showNotice } from "./core.js?v=202611011916";
import { afterLogin } from "./main.js?v=202611011916";


// ================== Compte ==================
const redirectHome = () => { const c = LS.get("sinema-invite"); return c ? `${HOME}?salon=${c}` : HOME; };
const PASS_OK = p => p.length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p);
function authMessage(err){
  const m = (err && err.message) || String(err);
  if (/Invalid login credentials/i.test(m)) return "E-mail ou mot de passe incorrect.";
  if (/Email not confirmed/i.test(m)) return "Ton e-mail n'est pas encore confirmé. Clique sur le lien reçu, ou renvoie-le.";
  if (/already registered|already been registered/i.test(m)) return "Un compte existe déjà avec cet e-mail. Connecte-toi.";
  if (/rate limit|too many/i.test(m)) return "Trop de tentatives ou d'e-mails envoyés. Réessaie dans un moment.";
  if (/Password should|weak password/i.test(m)) return "Mot de passe trop faible : 10 caractères minimum, avec des lettres et des chiffres.";
  if (/valid email|invalid format/i.test(m)) return "Cette adresse e-mail n'est pas valide.";
  if (/not authorized/i.test(m)) return "L'envoi d'e-mails n'est pas encore configuré pour cette adresse (voir les réglages SMTP de Supabase).";
  return m;
}
let authMode = "signup";
function setAuthMode(mode){
  authMode = mode;
  segSelectBy($("authSeg"), b => b.id === (mode === "login" ? "modeLogin" : "modeSignup"));
  $("signupOnly").hidden = mode !== "signup"; $("forgotBtn").hidden = mode !== "login";
  $("authSubmit").textContent = mode === "signup" ? "Créer mon compte" : "Se connecter";
  $("authPass").autocomplete = mode === "signup" ? "new-password" : "current-password";
}
function showAuth(mode){
  $("view-auth").hidden = false; $("authForm").hidden = false; $("checkMail").hidden = true;
  $("authName").value = LS.get("sinema-name") || ""; setAuthMode(mode); refreshSegs();
}
function showCheckMail(email){ $("authForm").hidden = true; $("checkMail").hidden = false; $("checkMailTo").textContent = email; }
$("authForm").onsubmit = async e => {
  e.preventDefault(); showNotice("");
  const email = $("authEmail").value.trim(), password = $("authPass").value, name = $("authName").value.trim();
  if (!email){ showNotice("Indique ton e-mail."); return; }
  const btn = $("authSubmit"); btn.disabled = true;
  try{
    if (authMode === "signup"){
      if (!name){ showNotice("Indique ton pseudo."); return; }
      if (!PASS_OK(password)){ showNotice("Mot de passe trop faible : 10 caractères minimum, avec des lettres et des chiffres."); return; }
      const { data, error } = await sb.auth.signUp({ email, password, options:{ data:{ name }, emailRedirectTo: redirectHome() } });
      if (error) throw error;
      LS.set("sinema-name", name);
      if (data.session) return afterLogin(data.session);
      if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length){ setAuthMode("login"); showNotice("Un compte existe déjà avec cet e-mail. Connecte-toi."); return; }
      showCheckMail(email);
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error){ if (/Email not confirmed/i.test(error.message)) showCheckMail(email); throw error; }
      await afterLogin(data.session);
    }
  } catch(err){ showNotice(authMessage(err)); }
  finally { btn.disabled = false; }
};
$("resendBtn").onclick = async () => {
  const { error } = await sb.auth.resend({ type:"signup", email:$("checkMailTo").textContent, options:{ emailRedirectTo: redirectHome() } });
  showNotice(error ? authMessage(error) : "E-mail renvoyé.");
};
$("backToLogin").onclick = () => showAuth("login");
$("forgotBtn").onclick = async () => {
  const email = $("authEmail").value.trim();
  if (!email){ showNotice("Indique d'abord ton e-mail, puis clique sur « Mot de passe oublié ? »."); $("authEmail").focus(); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: HOME });
  showNotice(error ? authMessage(error) : "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé.");
};
function showReset(){ $("view-reset").hidden = false; $("view-auth").hidden = true; }
$("resetForm").onsubmit = async e => {
  e.preventDefault();
  const password = $("resetPass").value;
  if (!PASS_OK(password)){ showNotice("Mot de passe trop faible : 10 caractères minimum, avec des lettres et des chiffres."); return; }
  const { error } = await sb.auth.updateUser({ password });
  if (error){ showNotice(authMessage(error)); return; }
  showNotice("Mot de passe modifié.");
  const { data:{ session } } = await sb.auth.getSession();
  await afterLogin(session);
};
async function logout(){
  await sb.auth.signOut();
  // rien ne reste de la personne sur l'appareil : données gardées pour le mode hors connexion, choix en attente
  try{ await caches.delete("sinema-data"); }catch{}
  LS.set("sinema-outbox","");
  LS.set("sinema-room",""); location.href = HOME;
}

export { PASS_OK, authMessage, logout, setAuthMode, showAuth, showReset };
