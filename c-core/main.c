#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#define FOLDER 0        
#define FILE_TYPE 1     


typedef struct Node {   
    char name[50];
    int type;
    struct Node *firstChild;
    struct Node *nextSibling;
}Node;

Node *createNode(char *name , int type){
    Node *newNode = malloc(sizeof(Node));
    if (newNode == NULL){
        printf("Memory allocation failed\n");
        return NULL; 
    }
    strcpy(newNode->name, name);
    newNode->type = type;
    newNode->firstChild = NULL;
    newNode->nextSibling = NULL;

    return newNode;
}


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

    Node *college = createNode("college",FOLDER);
    printf("Name: %s\n", college->name);
    printf("Type: %d\n", college->type);

    free(college);

return 0;    
}