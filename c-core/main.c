#include <stdio.h>
#include <string.h>

#define FOLDER 0        // node type value is 0 it is a folder
#define FILE_TYPE 1     // if it is one it is a file

typedef struct Node {   // for file system a node contain name and type 
    char name[50];
    int type;
    struct Node *child ;   //pointer store address of another node
}Node;

int main(){
    Node root; 
    strcpy(root.name , "/");
    root.type = FOLDER;
    
    Node documents;
    strcpy(documents.name , "Documents");
    documents.type = FOLDER;

    root.child = &documents;
    
    printf("name: %s\n", root.name);
    printf("name: %s\n", root.child->name);
    
return 0;    
}