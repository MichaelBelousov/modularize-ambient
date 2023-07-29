import ts from "typescript";
import Yargs from "yargs";
import transformer from "./transformer";


function compile(fileNames: string[], options: ts.CompilerOptions): void {
  // Create a Program with an in-memory emit
  const createdFiles: Record<string, string> = {};
  const host = ts.createCompilerHost(options);
  host.writeFile = (fileName: string, contents: string) => createdFiles[fileName] = contents
  
  // Prepare and emit the d.ts files
  const program = ts.createProgram(fileNames, options, host);
  const result = ts.transform(fileNames.map(f => program.getSourceFile(f)).filter((x): x is ts.SourceFile => !!x), [transformer]);
  const defaultPrinter = ts.createPrinter();
  result.transformed.forEach(defaultPrinter.printFile);
}

if (module === require.main) {
  const args = Yargs(process.argv.slice(2))
    .usage(
      [
        "Transform the specified source iModel into a new target iModel.",
        "You must set up a .env file to connect to an online iModel, see the .env.template file to do so.",
      ].join("\n")
    )
    .strict()
    .options({
      // used if the source iModel is a snapshot
      sourceFile: {
        desc: "The full path to the source iModel",
        type: "string",
        required: true,
      },
    })
    .parseSync();

  compile([args.sourceFile], {
    allowJs: true,
    declaration: true,
    emitDeclarationOnly: true,
    plugins: [ 
      { "transform": require.resolve("./transformer") } as any
    ],
  });
}
