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
    Node *newNode = (Node*)malloc(sizeof(Node));
    if (newNode == NULL){
        printf("Memory allocation failed\n");
        return NULL; 
    }
    strcpy(newNode->name, name);
    newNode->type = type;
    newNode->firstChild = NULL;             //initially set both null cause node has no child or sibling when created ;
    newNode->nextSibling = NULL;

    return newNode;
}

void addChild (Node *parent , Node *child) {
    if(parent->firstChild == NULL){
        parent->firstChild = child;
        return;
    }
    Node *current = parent->firstChild;
    while(current->nextSibling!= NULL){
        current = current->nextSibling;
    }
    current->nextSibling = child;
}


int main(){
    Node *root = createNode("/", FOLDER);
    Node *document = createNode("Documents", FOLDER);

    addChild(root , document);

    Node *current = root->firstChild;
    
    
    Node *downloads = createNode("Downloads", FOLDER);
    addChild(root, downloads);

    while(current != NULL){
        printf("%s\n", current->name);
        current = current->nextSibling;
    }


return 0;    
}