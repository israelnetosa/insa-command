// Grava ícone e informações de versão no INSA Command.exe sem precisar de Wine (resedit é JS puro).
const { join } = require('node:path');
const fs = require('node:fs');
module.exports = async (ctx) => {
  if (ctx.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const PELibrary = await import('pe-library');
  const R = ResEdit.default ?? ResEdit, P = PELibrary.default ?? PELibrary;
  const exe = join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.exe`);
  const v = ctx.packager.appInfo.version;
  const pe = P.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = P.NtExecutableResource.from(pe);
  const ico = R.Data.IconFile.from(fs.readFileSync(join(__dirname, 'icon.ico')));
  const groups = R.Resource.IconGroupEntry.fromEntries(res.entries);
  const id = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
  R.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map(i => i.data));
  const vi = R.Resource.VersionInfo.fromEntries(res.entries)[0] ?? R.Resource.VersionInfo.createEmpty();
  const [a, b, c] = v.split('.').map(Number);
  vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: 'INSA Command', ProductName: 'INSA Command', CompanyName: 'INSA Dividend Army',
    LegalCopyright: 'Uso pessoal e privado', OriginalFilename: 'INSA Command.exe', FileVersion: v, ProductVersion: v,
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(pe);
  fs.writeFileSync(exe, Buffer.from(pe.generate()));
  console.log('  • ícone e versão gravados em', exe);
};
