const TAG_TYPE = "tag";
const COMMAND_TYPE = "command";
const TAG_ARG_TYPE = "tagArg";
const IGNORE_TYPE = "comment";
function isNumber(n)
{
	return !isNaN(n) && isFinite(n);
}


function AlphaBlock(action, value, shouldBreakpoint, blockType)
{
	this.action = action;
	this.value = value;
	this.shouldBreakpoint = shouldBreakpoint;
	this.type = blockType;
}
AlphaBlock.prototype.getValue = function()
{
	return this.value;
}

function AlphaReader(code)
{
	this.alphaCode = code.replace(/\s|#.*#/g, ""); //Remove whitespace and comments
	this.p = 0;
	this.tags = {};
	this.blocks = [];
}
//Process raw alpha into blocks and a tag jump table. returns an object in the form of
/*
* { 
*	codeBlocks:AlphaBlock[],
*	tagTable:{name:string, instructionNumber:number}
* }
*/
AlphaReader.prototype.process = function()
{	
	var _blocks = this.blockify(this.alphaCode);	
	var _jumpTable = this.asJumpTable(_blocks); // provide a quick jump reference for the interpreter
	
	return {blocks:_blocks, jumpTable:_jumpTable};
}
AlphaReader.prototype.asJumpTable = function(blocks)
{
	var tags = {};
	for(var i = 0; i < blocks.length; i++)
	{
		if(blocks[i].type == TAG_TYPE)
		{
			tags[blocks[i].action] = blocks[i].value;
		}
	}
	return tags;
}
AlphaReader.prototype.readBlock = function(blockIndex)
{
		var c = this.readChar();
		var value;
		var blockType = COMMAND_TYPE;

		switch(c)
		{
			case "b":
			case "c":
			case "d":
			case "e":
				if(this.peekChar() == ":") //Jump statements can have tag arguments
				{
					blockType = TAG_ARG_TYPE; 
				}		
			case "a":
			case "g":
				return new AlphaBlock(c, this.readValue(), this.readBreakpoint(), blockType);
				break;
			case "o":
			case "n":
			case "p":
			case "l":
			case "f":
			case "z":
				return new AlphaBlock(c, undefined, this.readBreakpoint(), blockType);
				break;
			case ":":
				return new AlphaBlock(this.readTag(), blockIndex, false, TAG_TYPE); //Tags refer to argument after them.
				break;
			
			default:
				throw "Invalid action: " + c;
		}
		

}

AlphaReader.prototype.blockify = function(rawAlpha)
{
	var blocks = []
	this.p = 0;
	while(!this.atEnd())
	{
		blocks.push(this.readBlock(blocks.length));
	}
	return blocks;
}

AlphaReader.prototype.readToDelimiter = function(delimiter)
{
	var name = "";
	while(!this.atEnd())
	{
		var c = this.readChar();
		
		if(c == delimiter)
		{
			return name;
		}
		name += c;
	}
	throw "Closer not found!";

}
AlphaReader.prototype.readTag = function()
{
	return this.readToDelimiter(":");
}
//Get next character in alphaCode
AlphaReader.prototype.readChar = function()
{
	var c = this.alphaCode[this.p];
	this.p++;
	return c;
}
AlphaReader.prototype.getTagBlockLocation = function(tagName)
{
	if(this.tags[tagName]!= undefined)
	{
		return this.tags[tagName];
	}
	else
	{
		var undefinedTag = {tagLocation:undefined};
		return undefinedTag;
	}
}

//Read value after character command, retrive numerical representation of read value
AlphaReader.prototype.readValue = function()
{
	var next = this.peekChar();
	if(isNumber(next) || next == "-")
	{
		return this.readNumeric();
	}
	else if(next == "'")
	{
		return this.readCharAsNumeric();
	}
	else if(next == ":" || next == "#")
	{
		this.readChar(); //Skip opening
		return this.readToDelimiter(next);
	}
	return this.readRegister();
}
AlphaReader.prototype.readBreakpoint = function()
{
	var next = this.peekChar();
	if(next == "*")
	{
		this.readChar(); //get it out of the way
		return true;
	}
	return false;
}
//Read a "character" in alpha code, such as 'a'
AlphaReader.prototype.readCharAsNumeric = function()
{
	if(this.readChar() != "'")
	{
		throw "Character missing open quote";
	}
	var number = this.readChar().charCodeAt(0);
	if(this.readChar() != "'")
	{
		throw "Character missing end quote";
	}
	return number;
}

//Read a register from the alpha code and return its numerical value.
AlphaReader.prototype.readRegister = function()
{
	var register = this.readChar();
	switch(register)
	{
		case "I":
		case "Z":
		case "S":
			return register;
		default:
			throw "Invalid register: " + register;
	}
}
//Read a number
AlphaReader.prototype.readNumeric = function()
{
	var i;
	var number;
	//Place index on the start of the number. 
	for(i = this.p; (isNumber(this.alphaCode[i]) || this.alphaCode[i] == "-" || this.alphaCode[i] == "'") && i < this.alphaCode.length; i++)
	{
		if(this.alphaCode[i] == "'")
		{
			this.p = i;
			number = this.readCharAsNumeric();
		}
	}
	var number = parseInt(this.alphaCode.slice(this.p, i));
	this.p = i;
	return number;
	
}

//Determine what's next in the code, but don't increment the program counter.
AlphaReader.prototype.peekChar = function()
{
	//if(p + 1 > this.alphaCode.length)
	//{
	//	return undefined;
	//}
	return this.alphaCode[this.p];
}
//True if at end, false if not.
AlphaReader.prototype.atEnd = function()
{
	return this.alphaCode.length == this.p;
}

function AlphaInterpreter(codeText)
{
	this.rawText = codeText;
	this.p = 0;
	this.c = "";
	this.accumulator = 0;
	this.stack = [];
}
AlphaInterpreter.prototype.init = function()
{
	var processor = new AlphaReader(this.rawText);
	try
	{
		var blocksAndJumpTable = processor.process(); 
		this.codeBlocks = blocksAndJumpTable.blocks;
		this.jumpTable = blocksAndJumpTable.jumpTable;

	}
	catch(err)
	{
		this.printErr(err);
	}
}
//Run the entire code
AlphaInterpreter.prototype.execute = function()
{
	
	for(this.p = 0; !this.atEnd(); this.p++)
	{
		this.executeStep();
	}
}
AlphaInterpreter.prototype.executeStep = function()
{
	var block = this.codeBlocks[this.p]
	if(block.type != TAG_TYPE) // Can't execute tags
	{
	
		try
		{	
			this.interpretBlock(block, this.jumpTable);
		}
		catch(err)
		{
			this.printErr(err);
			return;
		}
	}
	this.p++;
}
AlphaInterpreter.prototype.atEnd = function()
{
	return this.codeBlocks.length == this.p
}
AlphaInterpreter.prototype.printErr = function(err)
{
	if(this.errorOutputFunction == undefined)
	{
		//Kinda out of options here.
		console.log(err);
		return;
	}
	this.errorOutputFunction(err);

}
AlphaInterpreter.prototype.interpretBlockValue = function(block, jumpTable)
{
	if(block.type == TAG_ARG_TYPE)
	{
		return jumpTable[block.value];
	}
	//Special register cases
	if(block.value == "I")
	{
		if(this.inputFunction == undefined)
		{
			throw "Input not connected!";
		}
		return parseInt(this.inputFunction());
	}
	else if(block.value == "A")
	{
		return this.accumulator;
	}
	else if(block.value == "Z")
	{
		return -this.accumulator;
	}
	else if(block.value == "S")
	{
		return this.popStack();
	}
	else
	{
		return block.value;
	}
}
//Make a decision on what action to take depending on an input character of alpha code.
AlphaInterpreter.prototype.interpretBlock = function(block, jumpTable)
{
	
	switch(block.action)
	{
		case "a": //Accumulate
			this.accumulate(this.interpretBlockValue(block));
			break;
		case "g": //Assign
			this.accumulator = this.interpretBlockValue(block, jumpTable);
			break;
		case "b": //Jump if greater
			
			if(this.accumulator > 0)
			{
				this.jumpCodePointer(this.interpretBlockValue(block, jumpTable));
			}
			break;
		case "c": //Jump if equal
		
			if(this.accumulator == 0)
			{
				this.jumpCodePointer(this.interpretBlockValue(block, jumpTable));
			}
			break;
		case "d": //Jump if less
			if(this.accumulator < 0)
			{
				this.jumpCodePointer(this.interpretBlockValue(block, jumpTable));
			}
			break;
		case "e": //Jump
			this.jumpCodePointer(this.interpretBlockValue(block, jumpTable));
			break;
		case "o": //Output char 
			if(this.outputFunction == undefined)
			{
				throw "No output connected!";
			}
			this.outputFunction(String.fromCharCode(this.accumulator));
			break;
		case "n": //Output number
			if(this.outputFunction == undefined)
			{
				throw "No output connected!";
			}
			this.outputFunction(this.accumulator);
			break;
		case "p": //Push
			this.pushStack(this.accumulator);
			break;
		case "l": //Pop
			this.accumulator = this.popStack();
			break;
		case "f": //Flush
			this.flushStack();
			break;
		case "z": break; //Nop
		default: throw "Invalid command: " + character;
	}
	if(block.shouldBreakpoint)
	{
		this.breakpointFunction();
	}
	
}
//Increment the accumulator by some value.
AlphaInterpreter.prototype.accumulate = function(amount)
{
	if(!isNumber(amount))
	{
		throw "Improper value: " + amount;
	}
	this.accumulator += parseInt(amount);
}
//Set the program counter.
AlphaInterpreter.prototype.jumpCodePointer = function(location)
{
	if(location > this.codeBlocks.length - 1 || location < -1) //Program counter will increment to 0 next round.
	{
		throw "Invalid jump location: " + location;
	}
	this.p = location - 1; //Account for the code pointer jumping forward once a step
}
//Pop the stack, returns 0 if stack is empty.
AlphaInterpreter.prototype.popStack = function()
{
	if(this.stack.length > 0)
	{
		return this.stack.pop();
	}
	return 0;
}
//Push a vale onto the stack.
AlphaInterpreter.prototype.pushStack = function(n)
{
	this.stack.push(n);
}
//Reset the stack to an empty array.
AlphaInterpreter.prototype.flushStack = function()
{
	this.stack = [];
}

//User defined callbacks
AlphaInterpreter.prototype.inputFunction = undefined;
AlphaInterpreter.prototype.outputFunction = undefined;
AlphaInterpreter.prototype.errorOutputFunction = undefined;
AlphaInterpreter.prototype.breakpointFunction = undefined;