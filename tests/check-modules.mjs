// Vérifie les modules du site sans navigateur :
//  - chaque nom utilisé est déclaré dans le module, importé, ou fourni par le navigateur
//  - chaque nom importé existe bien dans les exports du module visé
//  - aucun module ne réaffecte une variable importée (interdit en JavaScript)
//  - tous les fichiers portent le même numéro de version ?v=
// Lancer :  cd tests && npm install && npm run check
import fs from "fs";
import path from "path";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import globals from "globals";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const files = ["config.js", "sw.js", ...fs.readdirSync(path.join(ROOT, "js")).filter(f => f.endsWith(".js")).map(f => "js/" + f)];
const known = new Set([...Object.keys(globals.browser), ...Object.keys(globals.serviceworker), ...Object.keys(globals.builtin)]);
const problems = [];
const mods = {};

for (const f of files){
  const code = fs.readFileSync(path.join(ROOT, f), "utf8");
  const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: f === "sw.js" ? "script" : "module", locations: true });
  const declared = new Set(), imported = new Map(), exported = new Set(), used = [], assigned = [];
  const addPattern = p => {
    if (!p) return;
    if (p.type === "Identifier") declared.add(p.name);
    else if (p.type === "ObjectPattern") p.properties.forEach(q => addPattern(q.type === "RestElement" ? q.argument : q.value));
    else if (p.type === "ArrayPattern") p.elements.forEach(addPattern);
    else if (p.type === "AssignmentPattern") addPattern(p.left);
    else if (p.type === "RestElement") addPattern(p.argument);
  };
  walk.full(ast, n => {
    if (n.type === "VariableDeclarator") addPattern(n.id);
    if ((n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ClassDeclaration") && n.id) declared.add(n.id.name);
    if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") n.params.forEach(addPattern);
    if (n.type === "CatchClause") addPattern(n.param);
    if (n.type === "ImportDeclaration") n.specifiers.forEach(s => imported.set(s.local.name, { from: n.source.value, name: s.imported ? s.imported.name : "default", line: n.loc.start.line }));
    if (n.type === "ExportNamedDeclaration"){
      n.specifiers.forEach(s => exported.add(s.exported.name));
      if (n.declaration) (n.declaration.declarations || [n.declaration]).forEach(d => d.id && exported.add(d.id.name));
    }
  });
  walk.fullAncestor(ast, (n, _s, anc) => {
    if (n.type !== "Identifier") return;
    const p = anc[anc.length - 2];
    if (!p) return;
    if (p.type === "MemberExpression" && p.property === n && !p.computed) return;
    if (p.type === "Property" && p.key === n && !p.computed && !p.shorthand) return;
    if (p.type === "MethodDefinition" && p.key === n) return;
    if (["ImportSpecifier", "ImportDefaultSpecifier", "ExportSpecifier", "LabeledStatement", "BreakStatement", "ContinueStatement"].includes(p.type)) return;
    if (p.type === "MetaProperty") return;
    used.push(n);
    if ((p.type === "AssignmentExpression" && p.left === n) || (p.type === "UpdateExpression" && p.argument === n)) assigned.push(n);
  });
  for (const n of used) if (!declared.has(n.name) && !imported.has(n.name) && !known.has(n.name)) problems.push(`${f}:${n.loc.start.line} « ${n.name} » n'est ni déclaré ni importé`);
  for (const n of assigned) if (imported.has(n.name) && !declared.has(n.name)) problems.push(`${f}:${n.loc.start.line} réaffecte « ${n.name} », importé`);
  mods[f] = { imported, exported, code };
}
// les imports pointent vers des exports existants
for (const [f, m] of Object.entries(mods)){
  for (const [local, im] of m.imported){
    if (/^https?:/.test(im.from)) continue;
    const target = path.normalize(path.join(path.dirname(f), im.from.replace(/\?.*$/, "")));
    if (!mods[target]){ problems.push(`${f}:${im.line} importe un fichier inconnu ${im.from}`); continue; }
    if (!mods[target].exported.has(im.name)) problems.push(`${f}:${im.line} « ${im.name} » n'est pas exporté par ${target}`);
  }
}
// un seul numéro de version partout (sinon un module serait chargé deux fois)
const versions = new Set();
for (const f of ["index.html", "sw.js", ...files.filter(f => f.startsWith("js/"))])
  for (const v of fs.readFileSync(path.join(ROOT, f), "utf8").matchAll(/\?v=(\d+)/g)) versions.add(v[1]);
if (versions.size > 1) problems.push(`plusieurs numéros de version : ${[...versions].join(", ")} (lancer scripts/version.sh)`);

if (problems.length){ console.log(problems.join("\n")); console.log(`\n✘ ${problems.length} problème(s)`); process.exit(1); }
console.log(`✔ ${files.length} fichiers vérifiés`);
