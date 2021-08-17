const fs = require("fs");
const util = require("util");
const process = require("process");

const TokenType = {
  NONE         : "none",
  CAPTURED     : false,
  KEYVALUE     : "keyvalue",
  EQUALITY     : "equality",
  ACCESSOR     : "accessor",
  ASSIGNMENT   : "assignment",
  ADDEQUALS    : "addequals",
  SUBEQUALS    : "subequals",
  MULDEQUALS   : "mulequals",
  DIVEQUALS    : "divequals",
  ANDEQUALS    : "andequals",
  OREQUALS     : "orequals",
  XOREQUALS    : "xorequals",
  RANGE        : "range",
  FUNCTIONDECL : "functiondecl",
  FUNCTIONCALL : "functioncall",
  SCOPE        : "scope",
  ARGS         : "args",
  ARRAY        : "array",
  ARRAYOBJ     : "arrayobj",
  LOGIC        : "logic",
  MUL          : "mul",
  DIV          : "div",
  SUB          : "sub",
  ADD          : "add",
  NOT          : "not",
  NEWLINE      : "newline",
  MULTICOMMENT : "multicomment",
  STRING       : "string",
  VARIABLE     : "variable",
  NUMBER       : "number",
  COMMENT      : "comment",
  OPERATION    : "operation",
  POINTER      : "pointer",
  INCREMENT    : "increment",
  DECREMENT    : "decrement",
  SEMICOLON    : ";",
  COMMA        : ",",
  KEYBOOL      : "bool",
  KEYCHAR      : "char",
  KEYSHORT     : "short",
  KEYINT       : "int",
  KEYLONG      : "long",
  KEYFLOAT     : "float",
  KEYDOUBLE    : "double",
  KEYVOID      : "void",
  KEYCASE      : "case",
  KEYBREAK     : "break",
  KEYELSE      : "else",
  KEYRETURN    : "return",
  COLLAPSE     : "collapse"
}
Object.freeze(TokenType);

const Keywords = {
  "bool"       : TokenType.KEYBOOL, 
  "char"       : TokenType.KEYCHAR, 
  "short"      : TokenType.KEYSHORT, 
  "int"        : TokenType.KEYINT,
  "long"       : TokenType.KEYLONG,
  "float"      : TokenType.KEYFLOAT, 
  "double"     : TokenType.KEYDOUBLE,
  "void"       : TokenType.KEYVOID,
  "case"       : TokenType.KEYCASE, 
  "break"      : TokenType.KEYBREAK, 
  "else"       : TokenType.KEYELSE,
  "return"     : TokenType.KEYRETURN,
  ";"          : TokenType.SEMICOLON,
  ","          : TokenType.COMMA
}

class Token{
  constructor(type = TokenType.NONE, word = "", args = [], linenum = 0, uncaptured = true){
    this.type         = type;
    this.word         = word;
    this.uncaptured   = uncaptured;
    this.uncollapsed  = true;
    this.args         = args;
    this.linenum      = linenum;
  }
}

let DEBUG_TOKENS       = false;
let REMOVE_COMMA       = true;
let REMOVE_DOT         = true;
let ADD_SEMI          = false;
let ADD_SPACES        = true;
let LOG_ORPHANED      = false;
let MOVE_GLOBAL_VARS  = true;
let START_EXEC;
let END_EXEC;
let lines = 0;

let KEEP_IMPORTS = true;
let META_ANALYSIS = true;
let ALL_FUNCTIONS = [];
let ALL_IMPORTS   = [];
let FILENUM       = 1;

function shoutToken(constructing,word){
  if(DEBUG_TOKENS)
    permLog("push "+constructing+" "+word);
}

function tokenize(line, tokens, multilineToken, filename, linenum){
    lines++;
    if(lines % 1000 === 0)
      permLog("Processed "+lines+" lines");
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
        if(line[i] === multilineToken.stringType && (line[i-1] !== "\\" || line[i-2] === "\\")) {
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
        multilineToken.word      += line[i];
        multilineToken.type       = TokenType.STRING;
        multilineToken.stringType = line[i];
      }else if(line[i] === "/" && line[i+1] === "*"){
        // Move handling to multiline code
        // (reduces duplicate code by having both single and multiline comments handled in same way)
        multilineToken.type = TokenType.MULTICOMMENT;
        multilineToken.word += line[i];
      }
      // If lowercase or uppercase letters
      else if((c >= "a".charCodeAt(0) && c <= "z".charCodeAt(0) ) ||
              (c >= "A".charCodeAt(0) && c <= "Z".charCodeAt(0) ) || 
              (line[i] === "_") || line[i] === "#"){
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
      }else if(line[i]==="*" && line[i+1]==="/"){
        if(LOG_ORPHANED)
          permLog("Orphaned comment close line: "+linenum+" in: "+filename);
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
        if((line[i] !== "\n")){
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
  let scopeStack = [];
  let debugStack = [];
  for(let i=0;i<tree.length;i++){
    if( tree[i].word === "(" ||
        tree[i].word === "{" ||
        tree[i].word === "["){
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
        if (subTokens !== null) {
          let start = scopeStack[scopeStack.length-1] + 1;
          for (let k = start; k < i; k++) {
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
        permLog("Unmatched token error in: "+filename);
        permLog("Current:", tree[i]);
        permLog("Stack:  ", debugStack);
        permLog("Position -4:", tree[i-4]);
        permLog("Position -3:", tree[i-3]);
        permLog("Position -2:", tree[i-2]);
        permLog("Position -1:", tree[i-1]);
        permLog("Position  0:", tree[i+0]);
        permLog("Position +1:", tree[i+1]);
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
  for(let i=0;i<tree.length;i++){
    let argsOffset = 1;
    // Skip newline characters
    while(i+argsOffset < tree.length && tree[i+argsOffset].type === TokenType.NEWLINE){
      argsOffset++;
    }
    if(tree[i].type === TokenType.VARIABLE && tree[i+argsOffset] != null && tree[i+argsOffset].type === TokenType.ARGS){
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
      tree[i].word = "++";
      tree.splice(i-1,1);
    }
    if(i>0 && tree[i-1].word === "-" && tree[i].word === "-"){
      tree[i].word = "--";
      tree.splice(i-1,1);
    }
    if(i>0 && tree[i-1].word === "&" && tree[i].word === "&"){
      tree[i].word = "&&";
      tree.splice(i-1,1);
    }
    if(i>0 && tree[i-1].word === "|" && tree[i].word === "|"){
      tree[i].word = "||";
      tree.splice(i-1,1);
    }
    if(i>0 && tree[i-1].word === "+" && tree[i].word === "="){
      tree[i].word = "+=";
      tree.splice(i-1,1);
    }
    if(i>0 && tree[i-1].word === "-" && tree[i].word === "="){
      tree[i].word = "-=";
      tree.splice(i-1,1);
    }
    if(i>0 && tree[i-1].word === "*" && tree[i].word === "="){
      tree.splice(i-1,1);
    }
    if(i>0 && tree[i-1].word === "/" && tree[i].word === "="){
      tree[i].word = "/=";
      tree.splice(i-1,1);
    }
    if(i>0 && tree[i-1].word === "&" && tree[i].word === "="){
      tree[i].word = "&=";
      tree.splice(i-1,1);
    }
    if(i>0 && tree[i-1].word === "|" && tree[i].word === "="){
      tree[i].word = "|=";
      tree.splice(i-1,1);
    }
    if(i>0 && tree[i-1].word === "^" && tree[i].word === "="){
      tree[i].word = "^=";
      tree.splice(i-1,1);
    }
    if(i>0 && tree[i-1].word === "!" && tree[i].word === "="){
      tree[i].word = "!=";
      tree.splice(i-1,1);
    }
    if(i>0 && tree[i-1].word === "=" && tree[i].word === "="){
      tree[i].word = "==";
      tree.splice(i-1,1);
    }
    if(tree[i] != null && Keywords[tree[i].word] != null){
      tree[i].type = Keywords[tree[i].word];
    }
  }
  // Secondary pass to do more transformations after previous transforms
  for(let i=0;i<tree.length;i++){
    if(tree[i].uncaptured && tree[i].word === "."){
      let subTokens = new Token(TokenType.ACCESSOR, tree[i].word,[tree[i-1],tree[i+1]],tree[i].linenum,TokenType.CAPTURED);
      tree.splice(i-1,3,subTokens);
      i--;
      continue;
    }
    // Not token
    if(tree[i].uncaptured && tree[i].word === "!"){
      let subTokens = new Token(TokenType.NOT, tree[i].word,[new Token(),tree[i+1]], tree[i].linenum, TokenType.CAPTURED);
      tree.splice(i,2,subTokens);
      i--;
      continue;
    }
    // Increment token
    if(tree[i].uncaptured && tree[i].word === "++"){
      let subTokens = new Token(TokenType.INCREMENT, tree[i].word,[tree[i-1],new Token()], tree[i-1].linenum, TokenType.CAPTURED);
      tree.splice(i-1,2,subTokens);
      i--;
      continue;
    }
    // Decrement token
    if(tree[i].uncaptured && tree[i].word === "--"){
      let subTokens = new Token(TokenType.DECREMENT, tree[i].word,[tree[i-1],new Token()], tree[i-1].linenum, TokenType.CAPTURED);
      tree.splice(i-1,2,subTokens);
      i--;
      continue;
    }
  }
  // Third pass to do more transformations after previous transforms
  for(let i=0;i<tree.length;i++){
    if(tree[i].uncaptured && tree[i].word === "*" && isKeyword(tree[i-1])){
      let subTokens = new Token(TokenType.POINTER, tree[i].word, [new Token(), tree[i+1]], tree[i+1].linenum, TokenType.CAPTURED);
      tree.splice(i,2,subTokens);
      i--;
      continue;
    }
    if(tree[i].uncaptured && tree[i].type === TokenType.ARRAY){
      let subTokens = new Token(TokenType.ARRAYOBJ, "", [tree[i-1], tree[i]], tree[i].linenum, TokenType.CAPTURED);
      tree.splice(i-1,2,subTokens);
      i--;
      continue;
    }
  }
  // Fourth pass
  for(let i=0;i<tree.length;i++){
        if(tree[i].uncaptured && tree[i].word === "+="){
      let subTokens = new Token(TokenType.ADDEQUALS,tree[i].word,[tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
      tree.splice(i-1,3,subTokens);
      i--;
      continue;
    }
    if(tree[i].uncaptured && tree[i].word === "-="){
      let subTokens = new Token(TokenType.SUBEQUALS,tree[i].word,[tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
      tree.splice(i-1,3,subTokens);
      i--;
      continue;
    }
    if(tree[i].uncaptured && tree[i].word === "*="){
      let subTokens = new Token(TokenType.MULEQUALS,tree[i].word,[tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
      tree.splice(i-1,3,subTokens);
      i--;
      continue;
    }
    if(tree[i].uncaptured && tree[i].word === "/="){
      let subTokens = new Token(TokenType.DIVEQUALS,tree[i].word,[tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
      tree.splice(i-1,3,subTokens);
      i--;
      continue;
    }
    if(tree[i].uncaptured && tree[i].word === "&="){
      let subTokens = new Token(TokenType.ANDEQUALS,tree[i].word,[tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
      tree.splice(i-1,3,subTokens);
      i--;
      continue;
    }
    if(tree[i].uncaptured && tree[i].word === "|="){
      let subTokens = new Token(TokenType.OREQUALS,tree[i].word,[tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
      tree.splice(i-1,3,subTokens);
      i--;
      continue;
    }
    if(tree[i].uncaptured && tree[i].word === "^="){
      let subTokens = new Token(TokenType.XOREQUALS,tree[i].word,[tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
      tree.splice(i-1,3,subTokens);
      i--;
      continue;
    }
    if(tree[i].uncaptured && tree[i].word === "!="){
      let subTokens = new Token(TokenType.EQUALITY,tree[i].word,[tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
      tree.splice(i-1,3,subTokens);
      i--;
      continue;
    }
    if(tree[i].uncaptured && tree[i].word === "=="){
      let subTokens = new Token(TokenType.EQUALITY,tree[i].word,[tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
      tree.splice(i-1,3,subTokens);
      i--;
      continue;
    }
    if(tree[i].uncaptured && tree[i].word === ":"){
      let subTokens = new Token(TokenType.KEYVALUE,tree[i].word,[tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
      tree.splice(i-1,3,subTokens);
      i--;
      continue;
    }
    if(  tree[i].uncaptured && (
        tree[i].word === "<"  ||
        tree[i].word === "<=" ||
        tree[i].word === ">"  ||
        tree[i].word === ">="
        )){
      if(tree[i-1] == null || tree[i+1] == null){
        permLog("Range compare error in: "+filename);
        permLog(tree[i-1]);
        permLog(tree[i+1]);
      }
      let subTokens = new Token(TokenType.RANGE,tree[i].word,[tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
      tree.splice(i-1,3,subTokens);
      i -= (i === 0 ? 1 : 2);
      continue;
    }
    // Convert assignments
    if(tree[i].uncaptured && (tree[i].word === "=" || tree[i].word === "+=" || tree[i].word === "-=")){
      let subTokens = new Token(TokenType.ASSIGNMENT,tree[i].word,[tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
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
      permLog("Removed undefined token in divmul: " + filename);
    }else{
    divmulparse(tree[i].args, filename);
    }
  }
  for(let i=1;i<tree.length;i++){
    if(tree[i].uncaptured && tree[i].word === "*"){
      if(!isKeyword(tree[i-1])){
        let subTokens = new Token(TokenType.MUL, tree[i].word, [tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
        tree.splice(i-1,3,subTokens);
        i--;
      }
    }
    if(tree[i].uncaptured && tree[i].word === "/"){
      let subTokens = new Token(TokenType.DIV,tree[i].word, [tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
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
      permLog("Removed undefined token in addsub: " + filename);
    }else{
    addsubparse(tree[i].args, filename);
    }
  }
  for(let i=1;i<tree.length-1;i++){
    if(tree[i].uncaptured && tree[i].word === "+"){
      let subTokens = new Token(TokenType.ADD,tree[i].word, [tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
      tree.splice(i-1,3,subTokens);
      i--;
    }
    if(tree[i].uncaptured && tree[i].word === "-"){
      let subTokens = new Token(TokenType.SUB,tree[i].word, [tree[i-1],tree[i+1]], tree[i-1].linenum, TokenType.CAPTURED);
      tree.splice(i-1,3,subTokens);
      i--;
    }
  }
}

function isKeyword(token){
  if(token == null)
    return true;
  return  token.type !== TokenType.VARIABLE;
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
          token.type === TokenType.ARRAYOBJ     ||
          token.type === TokenType.LOGIC        ||
          token.type === TokenType.INCREMENT    ||
          token.type === TokenType.DECREMENT    ||
          token.type === TokenType.POINTER      ||
          token.type === TokenType.NOT          ||
          token.type === TokenType.ADD          ||
          token.type === TokenType.SUB          ||
          token.type === TokenType.DIV          ||
          token.type === TokenType.MUL          ||
          token.type === TokenType.ADDEQUALS    ||
          token.type === TokenType.SUBEQUALS    ||
          token.type === TokenType.DIVEQUALS    ||
          token.type === TokenType.MULEQUALS    ||
          token.type === TokenType.ANDEQUALS    ||
          token.type === TokenType.OREQUALS     ||
          token.type === TokenType.XOREQUALS;

}

function binaryOperation(token){
  if(token == null)
    return false;
  return  token.type === TokenType.KEYVALUE     ||
          token.type === TokenType.EQUALITY     ||
          token.type === TokenType.ACCESSOR     ||
          token.type === TokenType.ASSIGNMENT   ||
          token.type === TokenType.RANGE        ||
          token.type === TokenType.ASSERT       ||
          token.type === TokenType.LOGIC        ||
          token.type === TokenType.NOT          ||
          token.type === TokenType.ADD          ||
          token.type === TokenType.SUB          ||
          token.type === TokenType.DIV          ||
          token.type === TokenType.MUL          ||
          token.type === TokenType.ARRAYOBJ     ||
          token.type === TokenType.ADDEQUALS    ||
          token.type === TokenType.SUBEQUALS    ||
          token.type === TokenType.DIVEQUALS    ||
          token.type === TokenType.MULEQUALS    ||
          token.type === TokenType.ANDEQUALS    ||
          token.type === TokenType.OREQUALS     ||
          token.type === TokenType.XOREQUALS    ||
          token.type === TokenType.INCREMENT    ||
          token.type === TokenType.DECREMENT    ||
          token.type === TokenType.POINTER      ||
          token.type === TokenType.REFERENCE;
}

function checkComma(token){
  if(token == null)
    return false;
  if(isKeyword(token))
    return true;
  return  token.type === TokenType.LOGIC        ||
          token.type === TokenType.NEWLINE      ||
          token.type === TokenType.MULTICOMMENT;
}

function addSpaceBinary(token){
  if(token == null)
    return false;
  if( token.type === TokenType.ACCESSOR         ||
      token.type === TokenType.NONE             ||
      token.type === TokenType.NOT              ||
      token.type === TokenType.INCREMENT        ||
      token.type === TokenType.DECREMENT        ||
      token.type === TokenType.POINTER          ||
      token.type === TokenType.SEMICOLON        ||
      token.type === TokenType.ARRAY            ||
      token.type === TokenType.ARRAYOBJ         ||
      token.type === TokenType.NEWLINE
  )
  return false;
  return true;
}

function addSpaceScope(token){
  if(token == null)
    return false;
  if( token.type === TokenType.ACCESSOR         ||
      token.type === TokenType.NONE             ||
      token.type === TokenType.SEMICOLON        ||
      token.type === TokenType.NEWLINE
  )
  return false;
  return true;
}

function variableDefined(scope,variable){
  if(scope == null){
    permLog("Error in variable defined");
    permLog(variable);
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

function collapseTree(tree, filename, startIn, endIn){
  let start = 0;
  let end = tree.length;
  if(startIn != null)
    start = startIn;
  if(endIn != null)
    end = endIn;
  for(let i=start;i<end;i++){
    // Collapse substructures
    for(let j=0;j<tree[i].args.length;j++){
      if(checkCollapse(tree[i].args[j])) {
        collapseTree(tree[i].args, filename);
      }
    }
    if(tree[i].uncollapsed && binaryOperation(tree[i]) && tree[i].args.length > 0){
      tree[i].uncollapsed = false;
      let operation = tree[i].word;
      tree[i].word = "";
      tree[i].word += (tree[i].args[0] == null) ? "" : tree[i].args[0].word;
      if(addSpaceBinary(tree[i])) tree[i].word += " ";
      tree[i].word += operation;
      if(addSpaceBinary(tree[i])) tree[i].word += " ";
      tree[i].word += (tree[i].args[1] == null) ? "" : tree[i].args[1].word;
      tree[i].args = [];
    }else if(tree[i].uncollapsed && tree[i].type === TokenType.FUNCTIONCALL){
      tree[i].uncollapsed = false;
      if(tree[i].args[0] == null){
        permLog("Error in functioncall collapse in: ",filename);
        permLog(tree[i]);
      }
      // Collapse function call
      tree[i].word += tree[i].args[0].word;
      if(tree[i].args.length > 1){
        tree[i].word += tree[i].args[1].word;
      }
      tree[i].args = [];
    }else if(tree[i].uncollapsed && tree[i].type === TokenType.FUNCTIONDECL){
      tree[i].uncollapsed = false;
      // Collapse function declaration
      tree[i].word = "def "+tree[i].word;
      tree[i].word += tree[i].args[0].word;
      if(tree[i].args.length > 1){
        tree[i].word += tree[i].args[1].word;
      }
      tree[i].args = [];
    }else  if(tree[i].uncollapsed && tree[i].type === TokenType.SCOPE){
      tree[i].uncollapsed = false;
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
          if(addSpaceScope(tree[i].args[j]) && addSpaceScope(tree[i].args[j+1])){
            tree[i].word += " ";
          }
        }
        tree[i].word += "}";
        // If scope is completely empty remove it
        if(empty)
          tree[i].word = "";
        tree[i].args = [];
      }else{
        tree[i].word = "";
        tree[i].args = [];
      }
    }else  if(tree[i].uncollapsed && tree[i].type === TokenType.ARRAY){
      tree[i].uncollapsed = false;
      // Collapse array
      tree[i].word = "[";
      for(let j=0;j<tree[i].args.length;j++){
        tree[i].word += tree[i].args[j].word;
      }
      tree[i].word += "]";
      tree[i].args = [];
    }else  if(tree[i].uncollapsed && tree[i].type === TokenType.ARGS){
      tree[i].uncollapsed = false;
      // Collapse arguments
      tree[i].word = "(";
      for(let j=0;j<tree[i].args.length;j++){
        
        if(j > 0 && tree[i].args[j].type !== TokenType.SEMICOLON && tree[i].args[j].type !== TokenType.COMMA)
          tree[i].word += " ";
        
        // Add the variable to the args collapse
        tree[i].word += tree[i].args[j].word;
      }
      tree[i].word += ")";
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

function permLog(){
  let concat = "";
  for(let i=0;i<arguments.length;i++){
    concat += (i!=0) ? " " : "" + arguments[i]; 
  }
  console.log(concat);
}

function saveTree(outputDirectory,filename,filecontents,callback){
  let newfilename = outputDirectory+filename;
  // Test if file exists
  fs.writeFile(newfilename,'',(err)=>{
    if(err) {
      let directory = newfilename.match(/(.+)\//)[0];
      // If directory doesn't exist construct it
      fs.mkdir(directory, {recursive: true}, (err) => {
        // Empty file again
        fs.writeFile(newfilename,filecontents,(err)=>{
          permLog("Saved to file: "+newfilename);
          callback();
        });
      })
    }else{
      // Write tree
      fs.writeFile(newfilename,filecontents,(err)=>{
        permLog("Saved to file: "+newfilename);
        callback();
      });
    }
  });
}

function flatten(tree){
  let flattened = "";
  for(let i=0;i<tree.length;i++){
    if( tree[i-1]      != null                && 
        tree[i-1].type != TokenType.NEWLINE   &&
        tree[i].type   != TokenType.NEWLINE   &&
        tree[i].type   != TokenType.COMMA     &&
        tree[i].type   != TokenType.SEMICOLON
        )
      flattened += " ";
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
  permLog("Processing: "+filepath);
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
    scopeparse(tokens, filepath);
    compoundScopes(tokens, null, null, filepath);
    divmulparse(tokens, filepath);
    addsubparse(tokens, filepath);
    //console.dir(tokens,{depth:null});
    collapseTree(tokens, filepath);
    filepath = replaceAll(filepath,"\\","/");
    let pathList  = filepath.split("/");
    let filename  = pathList.pop();
    let directory = pathList.join("/");
    if(directory.length > 0) directory += "/";
    saveTree(directory,filename.replace("\.c","-out.c"),flatten(tokens),()=>{
      callback();
    });
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
  permLog("ALL Functions:  [");
  for(let i=0;i<functions.length;i++){
    let padded = ""+printFunctions[functions[i]]
    while(padded.length < 5){
      padded = " "+padded;
    }
    permLog(padded," : ",functions[i]);
  }
  permLog("]");
}

function printUsage(){
  permLog("Usage: node transpiler filename");
  permLog("       node transpiler directory");
  permLog("       node transpiler directory filename");
}

function printStats(){
  //printFunctions(ALL_FUNCTIONS);
  ALL_IMPORTS   = ALL_IMPORTS.sort();
  //permLog("ALL Imports: ",  ALL_IMPORTS);
  END_EXEC = new Date();
  let DIFF = new Date(END_EXEC-START_EXEC);
  if(FILENUM > 1)
    permLog("Files processed: "+FILENUM);
  permLog("Lines processed: "+lines);
  permLog("Timing: "+DIFF.getMinutes()+"m "+DIFF.getSeconds()+"s "+DIFF.getMilliseconds()+"ms");
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
        printStats();
      });
    }else{
      // If one directory argument is passed
      if(process.argv[3] == null){
        let fileList = createDirectoryTree(process.argv[2]);
        let testList = fileList.filter(file => file.match(/.test$/));
        FILENUM = testList.length;
        permLog(testList);
        processMultiple("../src/output/", testList,()=>{
          printStats();
        });
      }else{
        // If directory argument and file argument is passed
        if(process.argv[3].includes(".")){
          let fileList = createDirectoryTree(process.argv[2]);
          //permLog(fileList);
          let target = fileList.filter(file => file.includes(process.argv[3]));
          if(target.length === 0){
            permLog("Target file not found in directory");
          }else{
            processFile("../src/output/",target[0],()=>{
              printStats();
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

