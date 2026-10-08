#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#define FOLDER 0        // node type value is 0 it is a folder
#define FILE_TYPE 1     // if it is one it is a file

typedef struct Node {   // for file system a node contain name and type 
    char name[50];
    int type;
    struct Node *firstChild;
    struct Node *nextSibling;
}Node;

int main(){
    Node root; 
    strcpy(root.name , "/");
    root.type = FOLDER;
    
    Node documents;
    strcpy(documents.name , "Documents");
    documents.type = FOLDER;

    Node downloads;
    strcpy(downloads.name , "Downloads");
    downloads.type = FOLDER;

    Node project;
    strcpy(project.name , "Project");
    project.type = FOLDER;
    root.firstChild = &documents;

    documents.nextSibling = &downloads;
    downloads.nextSibling = &project;
    project.nextSibling = NULL;

    root.nextSibling = NULL;

    downloads.firstChild = NULL;
    documents.firstChild = NULL;
    project.firstChild = NULL;

    Node *current = root.firstChild;
    while(current != NULL){
        printf("child: %s\n", current->name);
        current = current->nextSibling;
    }

    Node *newNode = malloc(sizeof(Node));

    if(newNode == NULL){
        printf("Memory allocation failed\n");
        return 1;
    }
    strcpy("College ", newNode->name);
    newNode->type = FOLDER;
    newNode->firstChild = NULL;
    newNode->nextSibling=NULL;

    printf("Name: %s\n", newNode->name);
    printf("Type: %d\n", newNode->type);

    free(newNode);

return 0;    
}