const fs = require("fs");
const util = require("util");
const process = require("process");

class Token{
	constructor(type, word, args, linenum = 0){
		this.type = type;
		this.word = word;
		this.args = args;
		this.linenum = linenum;
	}
}

let DEBUG_TOKENS 	  	= false;
let REMOVE_COMMA   		= true;
let REMOVE_DOT     		= true;
let ADD_SEMI		    	= false;
let ADD_SPACES      	= true;
let LOG_ORPHANED			= false;
let MOVE_GLOBAL_VARS	= true;
let START_EXEC;
let END_EXEC;
let lines = 0;

let KEEP_IMPORTS = true;
let META_ANALYSIS = true;
let ALL_FUNCTIONS = [];
let ALL_IMPORTS   = [];

function shoutToken(constructing,word){
	if(DEBUG_TOKENS)
		console.log("push "+constructing+" "+word);
}

function tokenize(line, tokens, multilineToken, filename, linenum){
  	lines++;
  	if(lines % 1000 === 0)
  		console.log("Processed "+lines+" lines");
	let i=0;
	let constructing = "none";
	let word = "";
	while(i < line.length){

		// MULTILINE TOKEN HANDLING

		if(multilineToken.type === "multicomment"){
			// Add character to string
			multilineToken.word += line[i];
			// Get last index
			let last = multilineToken.word.length-1;
			if(multilineToken.word[last-1] === "*" && multilineToken.word[last] === "/"){
				// Make token
				constructing = multilineToken.type;
				word = multilineToken.word;
				multilineToken.type = "none";
				multilineToken.word = "";

				// Push this token
				shoutToken(constructing,word);
				tokens.push(new Token(constructing,word,[], linenum));
				constructing = "none";
				word = "";
			}else{
				if(i===line.length-1)
					multilineToken.word += "\n";
			}
		}else if(multilineToken.type === "string"){
			// Make string token
			while(i < line.length){
				multilineToken.word += line[i];
				// Check that starting quote type (',") matches closing type
				if(line[i] === multilineToken.stringType) {
					// Escaped quote check
					let triple = (i - 1 >= 0) ? line[i - 1] : "";
					triple += line[i];
					triple += (i + 1 < line.length) ? line[i + 1] : "";
					if (triple !== '&";'){
						break;
					}else{
						// Replace escaped quote with normal escaped quote
						multilineToken.word = multilineToken.word.slice(0,multilineToken.word.length-2);
						multilineToken.word += "\\\"";
						i++;
					}
				}
				i++;
			}
			// Check that starting quote type (',") matches closing type
			if(line[i] === multilineToken.stringType){
				// Make token
				constructing = multilineToken.type;
				word = multilineToken.word;
				multilineToken.word = "";
				multilineToken.type = "none";
				// Push this token
				shoutToken(constructing, word);
				tokens.push(new Token(constructing, word, [], linenum));
				constructing = "none";
				word = "";
			}

		// END MULTILINE TOKEN HANDLING

		}else{
			let c = line.charCodeAt(i);
		  if(line[i] === '"' || line[i] === "'"){
				// Move handling to multiline code
				// (reduces duplicate code by having both single and multiline strings handled in same way)
				multilineToken.word += line[i];
				multilineToken.type = "string";
				multilineToken.stringType = line[i];
			}else if(line[i] === "/" && line[i+1] === "*"){
				// Move handling to multiline code
				// (reduces duplicate code by having both single and multiline comments handled in same way)
				multilineToken.type = "multicomment";
				multilineToken.word += line[i];
			}
			// If lowercase or uppercase letters
			else if((c >= "a".charCodeAt(0) && c <= "z".charCodeAt(0) ) ||
				      (c >= "A".charCodeAt(0) && c <= "Z".charCodeAt(0) ) || (line[i] === "_")){
				if(constructing === "none" || constructing === "variable"){
					// Make token
					word += String.fromCharCode(c);
					constructing = "variable";
				}else{
					// Push word token
					shoutToken(constructing,word);
					tokens.push(new Token(constructing,word,[], linenum));
					constructing = "none";
					word = "";
				}
			}
			// If numbers or '.'
			// Variables can contain numbers aslong as it's not the first character
			// Don't append '.' character to variable but do it for numbers
			else if((c >= "0".charCodeAt(0) && c <= "9".charCodeAt(0)) ||
				      (line[i] === "." && constructing !== "variable")){
				if(constructing === "variable"){
					// Make word token
					word += String.fromCharCode(c);
				}
				else if(constructing === "none" || constructing === "num"){
					// Make number token
					let c2 = line.charCodeAt(i+1);
					if(line[i] !== "." || (c2 >= "0".charCodeAt(0) && c2 <= "9".charCodeAt(0)))
						word += String.fromCharCode(c);
					constructing = "num";
				}else{
					// Push this token
					shoutToken(constructing,word);
					tokens.push(new Token(constructing,word,[], linenum));
					constructing = "none";
					word = "";
				}
			}else if(line[i] === "/" && line[i+1] === "/"){
				// Make token
				constructing = "comment";
				while(i < line.length){
					word += line[i];
					i++;
				}
				// Push this token
				shoutToken(constructing,word);
				tokens.push(new Token(constructing,word,[], linenum));
				constructing = "none";
				word = "";
			}else if((line[i] === "&" && line[i+1] === "&") ||
						   (line[i] === "|" && line[i+1] === "|")){
				// Push previous token
				if(word !== ""){
					shoutToken(constructing,word);
					tokens.push(new Token(constructing,word,[], linenum));
					constructing = "none";
					word = "";
				}
				// Make token
				constructing = "emptylogic";
				word += line[i];
				word += line[i+1];
				// Push this token
				shoutToken(constructing,word);
				tokens.push(new Token(constructing,word,[], linenum));
				constructing = "none";
				word = "";
				i++;
			}else if(line[i] === ";"){
				//discard semicolons
			}else if(line[i]==="*" && line[i+1]==="/"){
				if(LOG_ORPHANED)
					console.log("Orphaned comment close line: "+linenum+" in: "+filename);
				i++;
			}else if(c > 32){
				// Push previous token
				if(word !== ""){
					shoutToken(constructing,word);
					tokens.push(new Token(constructing,word,[], linenum));
					constructing = "none";
					word = "";
				}
				// Remove unnecessary characters
				if((line[i] !== ","   || !REMOVE_COMMA) &&
					 (line[i] !== "\n") &&
					 (line[i] !== "."   || !REMOVE_DOT)){
					constructing = "op";
					word += String.fromCharCode(c);
					shoutToken(constructing,word);
					tokens.push(new Token(constructing,word,[], linenum));
					constructing = "none";
					word = "";
				}
			}else {
				// Push previous token because of whitespace
				if(word !== ""){
					tokens.push(new Token(constructing,word,[], linenum));
					constructing = "none";
					word = "";
				}
			}
		}
		i++;
	}
	if(multilineToken.type === "none"){
		if(word !== ""){
			tokens.push(new Token(constructing,word,[], linenum));
		}
		tokens.push(new Token("newline","\n",[], linenum));
	}
	return multilineToken;
}

let SCOPE_DICT = {
	"(" : ")",
	"{" : "}",
	"[" : "]"
}

function scopeparse(tree, filename){
	//console.log(tree);
	let scopeStack = [];
	let debugStack = [];
	let lastIdx = -1;
	for(let i=0;i<tree.length;i++){
		if(tree[i].word === "<" && tree[i-1].type === "newline"){
			tree.splice(i-1,1);
			i-=2;
			continue;
		}
		if(tree[i].word === ">" && i+1 < tree.length && tree[i+1].type === "newline"){
			//console.log("removed newline");
			tree.splice(i+1,1);
			i--;
			continue;
		}
		if( tree[i].word === "(" ||
				tree[i].word === "{" ||
				tree[i].word === "["){
				if(lastIdx === -1) {
					scopeStack.push(i);
					debugStack.push(tree[i].word);
					//console.log(debugStack);
				}
		}
		lastIdx = scopeStack.length === 0 ? -1 : scopeStack[scopeStack.length-1];
		if(tree[i].word === ")" ||
			 tree[i].word === "}" ||
			 tree[i].word === "]") {
			if (lastIdx !== -1 && tree[i].word === SCOPE_DICT[tree[lastIdx].word]) {
				let subTokens;
				if (tree[i].word === ")")
					subTokens = new Token("args", "", []);
				if (tree[i].word === "}")
					subTokens = new Token("scope", "", []);
				if (tree[i].word === "]")
					subTokens = new Token("array", "", []);
				if (subTokens !== null) {
					for (let k = lastIdx + 1; k < i; k++) {
						subTokens.args.push(tree[k]);
					}
					let removeCount = i - lastIdx + 1;
					tree.splice(lastIdx, removeCount, subTokens);
					scopeStack.pop();
					debugStack.pop();
					lastIdx = scopeStack.length === 0 ? -1 : scopeStack[scopeStack.length-1];
					i = lastIdx;
				}
			}else{
				// This occurs when one of the tokens hasn't been matched
				// for example unmatched quotes capturing code that's not meant to be a string
				console.log("Unmatched token error in: "+filename);
				console.log("Current:", tree[i]);
				console.log("Stack:  ", debugStack);
				console.log("Behind: ", tree[i-1]);
				console.log("Forward:", tree[i+1]);
			}
		}
	}
}

function compoundScopes(tree, parentNode, index, filename){
	for(let i=0;i<tree.length;i++){
		compoundScopes(tree[i].args, tree, i, filename);
	}
	let lastFunction = 0;
	// First pass for code transforms
	for(let i=0;i<tree.length-1;i++){
		let argsOffset = 1;
		// Skip newline characters
		while(i+argsOffset+1 < tree.length && tree[i+argsOffset].type === "newline"){
			argsOffset++;
		}
		if(tree[i].type === "variable" && tree[i+argsOffset].type === "args"){
			let scopeOffset=2;
			// Skip newline characters
			while(i+scopeOffset+1 < tree.length && tree[i+scopeOffset].type === "newline"){
				scopeOffset++;
			}
			if(i+scopeOffset < tree.length && tree[i+scopeOffset].type === "scope"){
				// Compress components into function calls with scopes
				tree[i].type = "functioncall";
				tree[i].args = [tree[i+argsOffset],tree[i+scopeOffset]];
				tree.splice(i+1,scopeOffset);
			}else{
				// Otherwise compress to function calls
				tree[i].type = "functioncall";
				tree[i].args = [tree[i+argsOffset]];
				tree.splice(i+1,argsOffset);
			}
		}
	}
	// Secondary pass to do more transformations after previous transforms
	for(let i=0;i<tree.length;i++){
    // Convert keyvalues
    if(tree[i].word === ":" && tree[i].type !== "keyvalue"){
      let subTokens = new Token("keyvalue",":",[tree[i-1],tree[i+1]]);
      tree.splice(i-1,3,subTokens);
      i -= (i === 0 ? 1 : 2);
			continue;
    }
		// Convert logic
		if(tree[i].type === "emptylogic"){
			let subTokens = new Token("logic",tree[i].word,[tree[i-1],tree[i+1]]);
			tree.splice(i-1,3,subTokens);
			i -= (i === 0 ? 1 : 2);
			continue;
		}
		// Convert inequalities
		if(tree[i].word === "!=" && tree[i].type !== "equality"){
			let subTokens = new Token("equality","!=",[tree[i-1],tree[i+1]]);
			tree.splice(i-1,3,subTokens);
			i -= (i === 0 ? 1 : 2);
			continue;
		}
		// Convert equalities
		if(tree[i].word === "==" && tree[i].type !== "equality"){
			let subTokens = new Token("equality","==",[tree[i-1],tree[i+1]]);
			tree.splice(i-1,3,subTokens);
			i -= (i === 0 ? 1 : 2);
			continue;
		}
		// Convert assignments
		if(tree[i].word === "=" && tree[i].type !== "assignment"){
			let subTokens = new Token("assignment","=",[tree[i-1],tree[i+1]]);
			tree.splice(i-1,3,subTokens);
			i -= (i === 0 ? 1 : 2);
			continue;
		}
		// Convert ranges
		if(	tree[i].type !== "range" && (
				tree[i].word === "<"  ||
				tree[i].word === "<=" ||
				tree[i].word === ">"  ||
				tree[i].word === ">="
				)){
			if(tree[i-1] == null || tree[i+1] == null){
				console.log("Range compare error in: "+filename);
				console.log(tree[i-1]);
				console.log(tree[i+1]);
			}
			let subTokens = new Token("range",tree[i].word,[tree[i-1],tree[i+1]]);
			tree.splice(i-1,3,subTokens);
			i -= (i === 0 ? 1 : 2);
			continue;
		}
	}
}

// Collapse arguments from multiply and div operations
function divmulparse(tree, filename){
	for(let i=0;i<tree.length;i++){
		if(tree[i] == null) {
			console.log("Error tree args null in: " + filename);
			console.log(tree);
		}
		divmulparse(tree[i].args, filename);
	}
	for(let i=1;i<tree.length;i++){
		if(tree[i].word === "*" && tree[i].args.length === 0){
			let subTokens = new Token("mul",tree[i].word,[]);
			subTokens.args.push(tree[i-1]);
			subTokens.args.push(tree[i+1]);
			tree.splice(i-1,3,subTokens);
			i--;
		}
		if(tree[i].word === "/" && tree[i].args.length === 0){
			let subTokens = new Token("div",tree[i].word,[]);
			subTokens.args.push(tree[i-1]);
			subTokens.args.push(tree[i+1]);
			tree.splice(i-1,3,subTokens);
			i--;
		}
	}
}
// Collapse arguments from addition and subtraction operations
function addsubparse(tree, filename){
	for(let i=0;i<tree.length;i++){
		if(tree[i] == null) {
			console.log("Error tree args null in: " + filename);
			console.log(tree);
		}
		addsubparse(tree[i].args, filename);
	}
	for(let i=1;i<tree.length-1;i++){
		if(tree[i].word === "+" && tree[i].args.length === 0){
			let subTokens = new Token("add",tree[i].word,[]);
			subTokens.args.push(tree[i-1]);
			subTokens.args.push(tree[i+1]);
			tree.splice(i-1,3,subTokens);
			i--;
		}
		if(tree[i].word === "-" && tree[i].args.length === 0){
			let subTokens = new Token("sub",tree[i].word,[]);
			subTokens.args.push(tree[i-1]);
			subTokens.args.push(tree[i+1]);
			tree.splice(i-1,3,subTokens);
			i--;
		}
	}
}

function checkCollapse(token){
	if(token == null)
		return false;
	return  token.type === "keyvalue" || 
			token.type === "equality" ||
			token.type === "accessor" ||
			token.type === "assignment" ||
			token.type === "range" ||
			token.type === "functiondecl" ||
			token.type === "functioncall" ||
			token.type === "scope" ||
			token.type === "args" ||
			token.type === "array" ||
			token.type === "logic" ||
			token.type === "mul" ||
			token.type === "div" ||
			token.type === "sub" ||
			token.type === "add";
}

function binaryOperation(token){
	if(token == null)
		return false;
	return token.type === "keyvalue" ||
			token.type === "equality" ||
			token.type === "accessor" ||
			token.type === "assignment" ||
			token.type === "range" ||
			token.type === "assert" ||
			token.type === "logic" ||
			token.type === "mul" ||
			token.type === "div" ||
			token.type === "sub" ||
			token.type === "add";
}

function checkComma(token){
	if(token === undefined)
		return false;
	return  token.type === "logic" ||
		 	token.type === "newline" ||
		 	token.type === "multicomment";
}

function variableDefined(scope,variable){
	if(scope == null){
		console.log("Error in variable defined");
		console.log(variable);
	}
	for(let i=0;i<scope.length;i++){
		if(scope[i] === variable)
			return true;
	}
	return false;
}

function replaceAll(string, input, output){
	let result;
	do{
		result = string;
		string = string.replace(input,output);
	}while(result !== string);
	return result;
}

function collapseTree(tree, root, parentDeclared, depth, filename, startIn, endIn){
	let start = 0;
	let end = tree.length;
	if(startIn != null)
		start = startIn;
	if(endIn != null)
		end = endIn;
	let declaredVariables = [];
	for(let i=0;i<parentDeclared.length;i++){
		declaredVariables.push(parentDeclared[i]);
	}
	for(let i=start;i<end;i++){
		// Collapse substructures
		for(let j=0;j<tree[i].args.length;j++){
			if(checkCollapse(tree[i].args[j])) {
				collapseTree(tree[i].args, root, declaredVariables, depth+1, filename);
			}
		}
		if(binaryOperation(tree[i])){
				
		}else if(tree[i].type === "functioncall"){
			if(tree[i].args[0] == null){
				console.log("Error in functioncall collapse in: ",filename);
				console.log(tree[i]);
			}
			// Collapse function call
			tree[i].type = "collapse";
			tree[i].word += tree[i].args[0].word;
			if(tree[i].args.length > 1){
				tree[i].word += tree[i].args[1].word;
			}
			tree[i].args = [];
		}else if(tree[i].type === "functiondecl"){
			// Collapse function declaration
			tree[i].type = "collapse";
			tree[i].word = "def "+tree[i].word;
			tree[i].word += tree[i].args[0].word;
			if(tree[i].args.length > 1){
				tree[i].word += tree[i].args[1].word;
			}
			tree[i].args = [];
		}else	if(tree[i].type === "scope"){
			if(tree[i].args.length !== 0) {
				let empty = true;
				// Collapse scope
				tree[i].word += "{";
				for (let j = 0; j < tree[i].args.length; j++) {
					// If argument length is not zero and not newline
					// then the scope is not empty
					if(empty && tree[i].args[j].word.length > 0 && tree[i].args[j].type !== "newline")
						empty = false;
					tree[i].word += tree[i].args[j].word;
				}
				tree[i].word += "}";

				// If scope is completely empty remove it
				if(empty)
					tree[i].word = "";

				tree[i].type = "collapse";
				tree[i].args = [];
			}else{
				tree[i].type = "collapse";
				tree[i].word = "";
				tree[i].args = [];
			}
		}else	if(tree[i].type === "array"){
			// Collapse array
			tree[i].word = "[";
			for(let j=0;j<tree[i].args.length;j++){
				// Slice off semicolon
				let wordLast = tree[i].args[j].word.length-1;
				if(tree[i].args[j].word[wordLast] === ";")
					tree[i].args[j].word = tree[i].args[j].word.slice(0,wordLast);

				tree[i].word += tree[i].args[j].word;
				if(j<tree[i].args.length-1 && !checkComma(tree[i].args[j])){
					tree[i].word += ", ";
				}
			}
			tree[i].word += "]";
			tree[i].type = "collapse";
			tree[i].args = [];
		}else	if(tree[i].type === "args"){
			// Collapse arguments
			tree[i].word = "(";
			for(let j=0;j<tree[i].args.length;j++){
				// Slice off semicolon
				let wordLast = tree[i].args[j].word.length-1;
				if(tree[i].args[j].word[wordLast] === ";")
					tree[i].args[j].word = tree[i].args[j].word.slice(0,wordLast);

				// If element is a property add quotes around it
				if(tree[i].args[j].type === "property")
					tree[i].args[j].word = '"' + tree[i].args[j].word + '"';

				// Add the variable to the args collapse
				tree[i].word += tree[i].args[j].word;

				// Variables that are defined in function declaration are already defined
				// Add these variables so that the assignments don't redefine the variables
				declaredVariables.push(tree[i].args[j].word);

				if(j<tree[i].args.length-1 && !checkComma(tree[i].args[j]) && !checkComma(tree[i].args[j+1])){
					tree[i].word += ", ";
				}
			}
			tree[i].word += ")";
			tree[i].type = "collapse";
			tree[i].args = [];
		}/*else{
			// Default to concatenating everything
			tree[i].type = "collapse";
			for(let j=0;j<tree[i].args.length;j++){
				tree[i].word += tree[i].args[j].word;
			}
			tree[i].args = [];
		}
		*/
	}
}

function saveTree(outputDirectory,filename,filecontents,callback){
	let newfilename = outputDirectory+filename.replace(".test",".groovy");
	// Test if file exists
	fs.writeFile(newfilename,'',(err)=>{
		if(err) {
			let directory = newfilename.match(/(.+)\//)[0];
			// If directory doesn't exist construct it
			fs.mkdir(directory, {recursive: true}, (err) => {
				// Empty file again
				fs.writeFile(newfilename,filecontents,(err)=>{
					console.log("Saved to file: "+newfilename);
					callback();
				});
			})
		}else{
			// Write tree
			fs.writeFile(newfilename,filecontents,(err)=>{
				console.log("Saved to file: "+newfilename);
				callback();
			});
		}
	});
}

function flatten(tree){
	let flattened = "";
	for(let i=0;i<tree.length;i++){
		flattened += tree[i].word;
	}
	return flattened;
}

function createDirectoryTree(dir) {
	const paths = [];
	const dirs = [dir];
	let i = 0;
	while (i < dirs.length) {
		const dir = dirs[i];
		const dirents = fs.readdirSync(dir);
		dirents.forEach(function(dirent) {
			let fullPath = dir+"/"+dirent;
			if (!fs.lstatSync(fullPath).isDirectory()) {
				paths.push(fullPath);
			} else {
				dirs.push(fullPath);
			}
		});
		++i;
	}
	return paths;
}

function processFile(outputDirectory,filepath,callback){
	let tokens = [];
	console.log("Processing: "+filepath);
	const linereader = require("readline").createInterface({
		input: fs.createReadStream(filepath),
		crlfDelay: Infinity
	});
	let multilineToken = new Token("none","",[]);
	let linenum = 0;
	linereader.on("line",(line)=>{
		linenum++;
		multilineToken = tokenize(line, tokens, multilineToken, filepath, linenum);
	});
	linereader.on("close",()=>{
    console.log("lexed");
		scopeparse(tokens, filepath);
    console.log("scope parse");
		compoundScopes(tokens, null, null, filepath);
    divmulparse(tokens, filepath);
		addsubparse(tokens, filepath);
    console.log("operation parse");
		console.dir(tokens,{depth:null});
    callback();
	});
}

function processMultiple(outputDirectory, dependencies, callback, newdependencies = []){
	let completed = 0;
	for(let i=0;i<dependencies.length;i++) {
    processFile(outputDirectory, dependencies[i], (subdep) => {
      for (let j = 0; j < subdep.length; j++) {
        newdependencies.push(subdep[j]);
      }
      completed++;
      if (completed === dependencies.length)
        callback(newdependencies);
    });
	}
}

function printFunctions(printFunctions){
	let functions = Object.keys(printFunctions);
	functions = functions.sort((a,b)=>{return printFunctions[a]-printFunctions[b]});
	console.log("ALL Functions:  [");
	for(let i=0;i<functions.length;i++){
		let padded = ""+printFunctions[functions[i]]
		while(padded.length < 5){
			padded = " "+padded;
		}
		console.log(padded," : ",functions[i]);
	}
	console.log("]");
}

function printUsage(){
	console.log("Usage: node transpiler filename");
	console.log("       node transpiler directory");
	console.log("       node transpiler directory filename");
}

function load(){
	START_EXEC = new Date();
	// If no arguments are passed
	if(process.argv[2] == null){
		printUsage();
	}else{
		// If one file argument is passed
		if(process.argv[2].includes(".")){
			processFile("../src/test/groovy/",process.argv[2],()=>{
				printFunctions(ALL_FUNCTIONS);
				ALL_IMPORTS   = ALL_IMPORTS.sort();
				console.log("ALL Imports: ",  ALL_IMPORTS);
				END_EXEC = new Date();
				let DIFF = new Date(END_EXEC-START_EXEC);
				console.log(lines+" lines processed in: "+DIFF.getMinutes()+"m "+DIFF.getSeconds()+"s "+DIFF.getMilliseconds()+"ms");
			});
		}else{
			// If one directory argument is passed
			if(process.argv[3] == null){
				let fileList = createDirectoryTree(process.argv[2]);
				let testList = fileList.filter(file => file.match(/.test$/));
				let fileNum = testList.length;
				console.log(testList);
				processMultiple("../src/output/", testList,()=>{
					printFunctions(ALL_FUNCTIONS);
					ALL_IMPORTS   = ALL_IMPORTS.sort();
					console.log("ALL Imports: ",  ALL_IMPORTS);
					END_EXEC = new Date();
					let DIFF = new Date(END_EXEC-START_EXEC);
					console.log("Files processed: "+fileNum);
					console.log("Lines processed: "+lines);
					console.log("Timing: "+DIFF.getMinutes()+"m "+DIFF.getSeconds()+"s "+DIFF.getMilliseconds()+"ms");
				});
			}else{
				// If directory argument and file argument is passed
				if(process.argv[3].includes(".")){
					let fileList = createDirectoryTree(process.argv[2]);
					//console.log(fileList);
					let target = fileList.filter(file => file.includes(process.argv[3]));
					if(target.length === 0){
						console.log("Target file not found in directory");
					}else{
						processFile("../src/output/",target[0],()=>{
							printFunctions(ALL_FUNCTIONS);
							ALL_IMPORTS   = ALL_IMPORTS.sort();
							console.log("ALL Imports: ",  ALL_IMPORTS);
							END_EXEC = new Date();
							let DIFF = new Date(END_EXEC-START_EXEC);
							console.log("Lines processed: "+lines);
							console.log("Timing: "+DIFF.getMinutes()+"m "+DIFF.getSeconds()+"s "+DIFF.getMilliseconds()+"ms");
						});
					}
				}else{
					printUsage();
				}
			}
		}
	}
}
load();

