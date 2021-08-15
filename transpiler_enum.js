const fs = require("fs");
const util = require("util");
const process = require("process");

const TokenType = {
  NONE         : 0,
  KEYVALUE     : 1,
  EQUALITY     : 2,
  ACCESSOR     : 3,
  ASSIGNMENT   : 4,
  RANGE        : 5,
  FUNCTIONDECL : 6,
  FUNCTIONCALL : 7,
  SCOPE        : 8,
  ARGS         : 9,
  ARRAY        : 10,
  LOGIC        : 11,
  MUL          : 12,
  DIV          : 13,
  SUB          : 14,
  ADD          : 15,
  NEWLINE      : 16,
  MULTICOMMENT : 17,
  STRING       : 18,
  EMPTYLOGIC   : 19,
  VARIABLE     : 20,
  NUMBER       : 21,
  COMMENT      : 22,
  OPERATION    : 23,
  COLLAPSE     : 24,
  INCREMENT    : 25
}
Object.freeze(TokenType);

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
	let constructing = TokenType.NONE;
	let word = "";
	while(i < line.length){

		// MULTILINE TOKEN HANDLING
		if(multilineToken.type === TokenType.MULTICOMMENT){
      let closedMultiline = false;
      while(i < line.length){
        multilineToken.word += line[i];
        // Check for close comment
        if(line[i] === "/" && line[i-1] === "*"){
          closedMultiline = true;
          break;
        }
        i++;
      }
			if(closedMultiline){
				shoutToken(multilineToken.type, multilineToken.word);
        tokens.push(new Token(multilineToken.type,multilineToken.word,[],linenum));
        multilineToken.type = TokenType.NONE;
        multilineToken.word = "";
        constructing = TokenType.NONE;
        word = "";
			}else{
        multilineToken.word += "\n";
			}
		}else if(multilineToken.type === TokenType.STRING){
      let closedMultiline = false;
			// Make string token
			while(i < line.length){
				multilineToken.word += line[i];
				// Check that starting quote type (',") matches closing type
				if(line[i] === multilineToken.stringType && line[i-1] !== "\\") {
          closedMultiline = true;
          break;
				}
				i++;
			}
			if(closedMultiline){
        shoutToken(multilineToken.type, multilineToken.word);
        tokens.push(new Token(multilineToken.type,multilineToken.word,[],linenum));
        multilineToken.type = TokenType.NONE;
        multilineToken.word = "";
        constructing = TokenType.NONE;
        word = "";
			}else{
        multilineToken.word += "\n";
			}

		// END MULTILINE TOKEN HANDLING

		}else{
			let c = line.charCodeAt(i);
		  if(line[i] === '"' || line[i] === "'"){
				// Move handling to multiline code
				// (reduces duplicate code by having both single and multiline strings handled in same way)
				multilineToken.word += line[i];
				multilineToken.type = TokenType.STRING;
				multilineToken.stringType = line[i];
			}else if(line[i] === "/" && line[i+1] === "*"){
				// Move handling to multiline code
				// (reduces duplicate code by having both single and multiline comments handled in same way)
				multilineToken.type = TokenType.MULTICOMMENT;
				multilineToken.word += line[i];
			}
			// If lowercase or uppercase letters
			else if((c >= "a".charCodeAt(0) && c <= "z".charCodeAt(0) ) ||
				      (c >= "A".charCodeAt(0) && c <= "Z".charCodeAt(0) ) || (line[i] === "_")){
				if(constructing === TokenType.NONE || constructing === TokenType.VARIABLE){
					// Make token
					word += String.fromCharCode(c);
					constructing = TokenType.VARIABLE;
				}else{
					// Push word token
					shoutToken(constructing,word);
					tokens.push(new Token(constructing,word,[], linenum));
					constructing = TokenType.NONE;
					word = "";
				}
			}
			// If numbers or '.'
			// Variables can contain numbers aslong as it's not the first character
			// Don't append '.' character to variable but do it for numbers
			else if((c >= "0".charCodeAt(0) && c <= "9".charCodeAt(0)) ||
				      (line[i] === "." && constructing !== TokenType.VARIABLE)){
				if(constructing === TokenType.VARIABLE){
					// Make word token
					word += String.fromCharCode(c);
				}
				else if(constructing === TokenType.NONE || constructing === TokenType.NUMBER){
					// Make number token
					let c2 = line.charCodeAt(i+1);
					if(line[i] !== "." || (c2 >= "0".charCodeAt(0) && c2 <= "9".charCodeAt(0)))
						word += String.fromCharCode(c);
					constructing = TokenType.NUMBER;
				}else{
					// Push this token
					shoutToken(constructing,word);
					tokens.push(new Token(constructing,word,[], linenum));
					constructing = TokenType.NONE;
					word = "";
				}
			}else if(line[i] === "/" && line[i+1] === "/"){
				// Make token
				constructing = TokenType.COMMENT;
				while(i < line.length){
					word += line[i];
					i++;
				}
				// Push this token
				shoutToken(constructing,word);
				tokens.push(new Token(constructing,word,[], linenum));
				constructing = TokenType.NONE;
				word = "";
			}else if((line[i] === "&" && line[i+1] === "&") ||
						   (line[i] === "|" && line[i+1] === "|")){
				// Push previous token
				if(word !== ""){
					shoutToken(constructing,word);
					tokens.push(new Token(constructing,word,[], linenum));
					constructing = TokenType.NONE;
					word = "";
				}
				// Make token
				constructing = TokenType.EMPTYLOGIC;
				word += line[i];
				word += line[i+1];
				// Push this token
				shoutToken(constructing,word);
				tokens.push(new Token(constructing,word,[], linenum));
				constructing = TokenType.NONE;
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
					constructing = TokenType.NONE;
					word = "";
				}
				// Remove unnecessary characters
				if((line[i] !== ","   || !REMOVE_COMMA) &&
					 (line[i] !== "\n") &&
					 (line[i] !== "."   || !REMOVE_DOT)){
					constructing = TokenType.OPERATION;
					word += String.fromCharCode(c);
					shoutToken(constructing,word);
					tokens.push(new Token(constructing,word,[], linenum));
					constructing = TokenType.NONE;
					word = "";
				}
			}else {
				// Push previous token because of whitespace
				if(word !== ""){
					tokens.push(new Token(constructing,word,[], linenum));
					constructing = TokenType.NONE;
					word = "";
				}
			}
		}
		i++;
	}
	if(multilineToken.type === TokenType.NONE){
		if(word !== ""){
			tokens.push(new Token(constructing,word,[], linenum));
		}
		tokens.push(new Token(TokenType.NEWLINE,"\n",[], linenum));
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
	for(let i=0;i<tree.length;i++){
		if( tree[i].word === "(" ||
				tree[i].word === "{" ||
				tree[i].word === "["){
        //console.log("Pushed",tree[i]);
        scopeStack.push(i);
        debugStack.push(tree[i].word);
		}
		if(tree[i].word === ")" ||
			 tree[i].word === "}" ||
			 tree[i].word === "]") {
			if (scopeStack.length !== 0 && tree[i].word === SCOPE_DICT[debugStack[debugStack.length-1]]) {
				let subTokens;
				if (tree[i].word === ")")
					subTokens = new Token(TokenType.ARGS, "", []);
				if (tree[i].word === "}")
					subTokens = new Token(TokenType.SCOPE, "", []);
				if (tree[i].word === "]")
					subTokens = new Token(TokenType.ARRAY, "", []);
        //console.log("Popped", tree[i]);
				if (subTokens !== null) {
					for (let k = scopeStack[scopeStack.length-1] + 1; k < i; k++) {
						subTokens.args.push(tree[k]);
					}
					let removeCount = i - scopeStack[scopeStack.length-1] + 1;
					tree.splice(scopeStack[scopeStack.length-1], removeCount, subTokens);
					i = scopeStack[scopeStack.length-1];
          scopeStack.pop();
					debugStack.pop();
				}
			}else{
				// This occurs when one of the tokens hasn't been matched
				// for example unmatched quotes capturing code that's not meant to be a string
				console.log("Unmatched token error in: "+filename);
				console.log("Current:", tree[i]);
				console.log("Stack:  ", debugStack);
        console.log("Position -4:", tree[i-4]);
        console.log("Position -3:", tree[i-3]);
        console.log("Position -2:", tree[i-2]);
				console.log("Position -1:", tree[i-1]);
				console.log("Position  0:", tree[i+0]);
				console.log("Position +1:", tree[i+1]);
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
		while(i+argsOffset+1 < tree.length && tree[i+argsOffset].type === TokenType.NEWLINE){
			argsOffset++;
		}
		if(tree[i].type === TokenType.VARIABLE && tree[i+argsOffset].type === TokenType.ARGS){
			let scopeOffset=2;
			// Skip newline characters
			while(i+scopeOffset+1 < tree.length && tree[i+scopeOffset].type === TokenType.NEWLINE){
				scopeOffset++;
			}
			if(i+scopeOffset < tree.length && tree[i+scopeOffset].type === TokenType.SCOPE){
				// Compress components into function calls with scopes
				tree[i].type = TokenType.FUNCTIONCALL;
				tree[i].args = [tree[i+argsOffset],tree[i+scopeOffset]];
				tree.splice(i+1,scopeOffset);
			}else{
				// Otherwise compress to function calls
				tree[i].type = TokenType.FUNCTIONCALL;
				tree[i].args = [tree[i+argsOffset]];
				tree.splice(i+1,argsOffset);
			}
		}
    if(i>0 && tree[i-1].word === "+" && tree[i].word === "+"){
      tree[i-1].word = "++";
      tree[i-1].type = TokenType.EMPTYLOGIC;
      tree.splice(i,1);
      i--;
    }
    if(i>0 && tree[i-1].word === "-" && tree[i].word === "-"){
      tree[i-1].word = "--";
      tree[i-1].type = TokenType.EMPTYLOGIC;
      tree.splice(i,1);
      i--;
    }
    if(i>0 && tree[i-1].word === "+" && tree[i].word === "="){
      tree[i-1].word = "+=";
      tree[i-1].type = TokenType.EMPTYLOGIC;
      tree.splice(i,1);
      i--;
    }
    if(i>0 && tree[i-1].word === "-" && tree[i].word === "="){
      tree[i-1].word = "-=";
      tree[i-1].type = TokenType.EMPTYLOGIC;
      tree.splice(i,1);
      i--;
    }
    if(i>0 && tree[i-1].word === "+" && tree[i].word === "="){
      tree[i-1].word = "+=";
      tree[i-1].type = TokenType.EMPTYLOGIC;
      tree.splice(i,1);
      i--;
    }
    if(i>0 && tree[i-1].word === "-" && tree[i].word === "="){
      tree[i-1].word = "-=";
      tree[i-1].type = TokenType.EMPTYLOGIC;
      tree.splice(i,1);
      i--;
    }
    if(i>0 && tree[i-1].word === "!" && tree[i].word === "="){
      tree[i-1].word = "!=";
      tree[i-1].type = TokenType.EMPTYLOGIC;
      tree.splice(i,1);
      i--;
    }
	}
	// Secondary pass to do more transformations after previous transforms
	for(let i=0;i<tree.length;i++){
    // Not token
    if(tree[i].word === "!" && tree[i].type !== TokenType.LOGIC){
      let subTokens = new Token(TokenType.LOGIC,"!",[new Token(0,"",[]),tree[i+1]], tree[i].linenum);
      tree.splice(i,2,subTokens);
      i -= (i === 0 ? 1 : 2);
			continue;
    }
    // Increment token
    if(tree[i].word === "++" && tree[i].type !== TokenType.INCREMENT){
      let subTokens = new Token(TokenType.INCREMENT,"++",[tree[i-1],new Token(0,"",[])], tree[i-1].linenum);
      tree.splice(i-1,2,subTokens);
      i -= (i === 0 ? 1 : 2);
			continue;
    }
    // Decrement token
    if(tree[i].word === "--" && tree[i].type !== TokenType.INCREMENT){
      let subTokens = new Token(TokenType.INCREMENT,"--",[tree[i-1],new Token(0,"",[])], tree[i-1].linenum);
      tree.splice(i-1,2,subTokens);
      i -= (i === 0 ? 1 : 2);
			continue;
    }
		// Convert inequalities
		if(tree[i].word === "!=" && tree[i].type !== TokenType.EQUALITY){
      console.log(tree[i-2],tree[i-2],tree[i]);
			let subTokens = new Token(TokenType.EQUALITY,"!=",[tree[i-1],tree[i+1]], tree[i-1].linenum);
			tree.splice(i-1,3,subTokens);
			i -= (i === 0 ? 1 : 2);
			continue;
		}
		// Convert equalities
		if(tree[i].word === "==" && tree[i].type !== TokenType.EQUALITY){
			let subTokens = new Token(TokenType.EQUALITY,"==",[tree[i-1],tree[i+1]], tree[i-1].linenum);
			tree.splice(i-1,3,subTokens);
			i -= (i === 0 ? 1 : 2);
			continue;
		}
    // Convert keyvalues
    if(tree[i].word === ":" && tree[i].type !== TokenType.KEYVALUE){
      let subTokens = new Token(TokenType.KEYVALUE,":",[tree[i-1],tree[i+1]], tree[i-1].linenum);
      tree.splice(i-1,3,subTokens);
      i -= (i === 0 ? 1 : 2);
			continue;
    }
		// Convert logic
		if(tree[i].type === TokenType.EMPTYLOGIC){
			let subTokens = new Token(TokenType.LOGIC,tree[i].word,[tree[i-1],tree[i+1]], tree[i-1].linenum);
			tree.splice(i-1,3,subTokens);
			i -= (i === 0 ? 1 : 2);
			continue;
		}
		// Convert assignments
		if((tree[i].word === "=" || tree[i].word === "+=" || tree[i].word === "-=") && tree[i].type !== TokenType.ASSIGNMENT){
			let subTokens = new Token(TokenType.ASSIGNMENT,"=",[tree[i-1],tree[i+1]], tree[i-1].linenum);
			tree.splice(i-1,3,subTokens);
			i -= (i === 0 ? 1 : 2);
			continue;
		}
		// Convert ranges
		if(	tree[i].type !== TokenType.RANGE && (
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
			let subTokens = new Token(TokenType.RANGE,tree[i].word,[tree[i-1],tree[i+1]]);
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
      tree.splice(i,1);
			console.log("Error tree args null in: " + filename);
			console.dir(tree,{depth:null});
		}else{
		divmulparse(tree[i].args, filename);
    }
	}
	for(let i=1;i<tree.length;i++){
		if(tree[i].word === "*" && tree[i].args.length === 0){
			let subTokens = new Token(TokenType.MUL,tree[i].word,[]);
			subTokens.args.push(tree[i-1]);
			subTokens.args.push(tree[i+1]);
			tree.splice(i-1,3,subTokens);
			i--;
		}
		if(tree[i].word === "/" && tree[i].args.length === 0){
			let subTokens = new Token(TokenType.DIV,tree[i].word,[]);
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
      tree.splice(i,1);
			console.log("Error tree args null in: " + filename);
			console.dir(tree,{depth:null});
		}else{
		addsubparse(tree[i].args, filename);
    }
	}
	for(let i=1;i<tree.length-1;i++){
		if(tree[i].word === "+" && tree[i].args.length === 0){
			let subTokens = new Token(TokenType.ADD,tree[i].word,[]);
			subTokens.args.push(tree[i-1]);
			subTokens.args.push(tree[i+1]);
			tree.splice(i-1,3,subTokens);
			i--;
		}
		if(tree[i].word === "-" && tree[i].args.length === 0){
			let subTokens = new Token(TokenType.SUB,tree[i].word,[]);
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
	return  token.type === TokenType.KEYVALUE     || 
          token.type === TokenType.EQUALITY     ||
          token.type === TokenType.ACCESSOR     ||
          token.type === TokenType.ASSIGNMENT   ||
          token.type === TokenType.RANGE        ||
          token.type === TokenType.FUNCTIONDECL ||
          token.type === TokenType.FUNCTIONCALL ||
          token.type === TokenType.SCOPE        ||
          token.type === TokenType.ARGS         ||
          token.type === TokenType.ARRAY        ||
          token.type === TokenType.LOGIC        ||
          token.type === TokenType.INCREMENT    ||
          token.type === TokenType.MUL          ||
          token.type === TokenType.DIV          ||
          token.type === TokenType.SUB          ||
          token.type === TokenType.ADD;
}

function binaryOperation(token){
	if(token == null)
		return false;
	return  token.type === TokenType.KEYVALUE     ||
          token.type === TokenType.EQUALITY     ||
          token.type === TokenType.ACCESSOR     ||
          token.type === TokenType.ASSIGNMENt   ||
          token.type === TokenType.RANGE        ||
          token.type === TokenType.ASSERT       ||
          token.type === TokenType.LOGIC        ||
          token.type === TokenType.MUL          ||
          token.type === TokenType.DIV          ||
          token.type === TokenType.SUB          ||
          token.type === TokenType.ADD;
}

function checkComma(token){
	if(token === undefined)
		return false;
	return  token.type === TokenType.LOGIC        ||
          token.type === TokenType.NEWLINE      ||
          token.type === TokenType.MULTICOMMENT;
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
				
		}else if(tree[i].type === TokenType.FUNCTIONCALL){
			if(tree[i].args[0] == null){
				console.log("Error in functioncall collapse in: ",filename);
				console.log(tree[i]);
			}
			// Collapse function call
			tree[i].type = TokenType.COLLAPSE;
			tree[i].word += tree[i].args[0].word;
			if(tree[i].args.length > 1){
				tree[i].word += tree[i].args[1].word;
			}
			tree[i].args = [];
		}else if(tree[i].type === TokenType.FUNCTIONDECL){
			// Collapse function declaration
			tree[i].type = TokenType.COLLAPSE;
			tree[i].word = "def "+tree[i].word;
			tree[i].word += tree[i].args[0].word;
			if(tree[i].args.length > 1){
				tree[i].word += tree[i].args[1].word;
			}
			tree[i].args = [];
		}else	if(tree[i].type === TokenType.SCOPE){
			if(tree[i].args.length !== 0) {
				let empty = true;
				// Collapse scope
				tree[i].word += "{";
				for (let j = 0; j < tree[i].args.length; j++) {
					// If argument length is not zero and not newline
					// then the scope is not empty
					if(empty && tree[i].args[j].word.length > 0 && tree[i].args[j].type !== TokenType.NEWLINE)
						empty = false;
					tree[i].word += tree[i].args[j].word;
				}
				tree[i].word += "}";

				// If scope is completely empty remove it
				if(empty)
					tree[i].word = "";

				tree[i].type = TokenType.COLLAPSE;
				tree[i].args = [];
			}else{
				tree[i].type = TokenType.COLLAPSE;
				tree[i].word = "";
				tree[i].args = [];
			}
		}else	if(tree[i].type === TokenType.ARRAY){
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
			tree[i].type = TokenType.COLLAPSE;
			tree[i].args = [];
		}else	if(tree[i].type === TokenType.ARGS){
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
			tree[i].type = TokenType.COLLAPSE;
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
