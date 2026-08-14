import ts from 'typescript';

/**
 * Reports whether a module exists only to re-export others. True when the file carries at least one export
 * declaration and no top-level statement other than an import or export declaration, which admits `export … from`,
 * `export *`, a side-effect `import` beside them, and an `import` paired with a bare `export` clause.
 * A module carrying any declaration of its own has a body and is not a barrel.
 */
export function isBarrelModule(sourceText: string): boolean {
  const sourceFile = ts.createSourceFile('module.ts', sourceText, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

  let hasExport = false;
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      hasExport = true;
      continue;
    }
    if (!ts.isImportDeclaration(statement)) return false;
  }

  return hasExport;
}
