/*
 * This a modified version of the interpreter made by Urban Müller.
 */

//#include <stdio.h>
#define PROGRAM_MEMORY 5000
#define GOTO_MEMORY 20

// type definitions and struct
typedef enum { false, true} bool; // making an enum for booleans, better than macros
typedef char string[PROGRAM_MEMORY];

struct stringAndPointer
{
	int i; // position in array
	char * p; // pointer to array 
	string a; // array
};

struct gotoExpressions
{
	char * a[GOTO_MEMORY];
	char l[GOTO_MEMORY];
	int i;
};

typedef struct stringAndPointer sap;

// globals
char b, o;
sap out, in;

// meta functions

int strLength(const char *str) 
{
	int length = 0;

	while (*str++) length++;

	return length;
}

// the main program

void interpret(char *c, int argc)
{
	char *d; // for assigning c to when the [] loop is activated on lines 43 - 60
	int base = 1; // goto the ^ and v cases for info vvvvv
	int comments = false; // a boolean, true when comments are active and false when they're not
	
	// storage of labels and other related data
	struct gotoExpressions jmp;

	int oldJmpI;
	bool changed = false;
	
	for(jmp.i = 0; jmp.i < GOTO_MEMORY; jmp.i++)
	{
		jmp.a[jmp.i] = 0;
	}

	jmp.i = 0;

}

int main(int argc, char *argv[])
{
	// initialising structs/new types
	in.p = in.a;
	in.i = 0;

	out.p = out.a;
	out.i = 0;

	char * f = "-f";
	char * i = "-i";

	if (compareString(argv[1], f))
	{

	}
	else if (compareString(argv[1], i))
	{

	}
	else
	{
		// for interpreting programs as command line arguments
		printf("Processing command line arguments as a code.\n");
		for (int i = 1; i < argc; i++) // iterating through each argument seperated by spaces
		{
			for (int j = 0; j < strLength(argv[i]); j++) // iterating through each char
			{
				*in.p++ = (char)((argv[i])[j]); // assigning character to in[] and increment the pointer
			}
			if(i < argc) *in.p++ = ' '; // adding in spaces based on argc and i
		}
		*in.p = 0;
		interpret(in.a, argc);
	}
	return 0; ////////// EXIT
}