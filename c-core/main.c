#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#define FOLDER 0        
#define FILE_TYPE 1     

#define HISTORY_LIMIT 100

typedef struct Node {   
    char name[50];
    int type;
    struct Node *firstChild;
    struct Node *nextSibling;
    struct Node *parent;
}Node;




void recordVisit(Node *history[], int *count,
                 int *index, Node *folder)
{
    /* Remove the forward history after the current position */
    *count = *index + 1;

    /* If history is full, discard the oldest entry */
    if(*count == HISTORY_LIMIT)
    {
        for(int i = 1; i < HISTORY_LIMIT; i++)
        {
            history[i - 1] = history[i];
        }

        *count = HISTORY_LIMIT - 1;
        (*index)--;
    }

    /* Record the new location */
    history[*count] = folder;
    *index = *count;
    (*count)++;
}

void printPath(Node *currentFolder){
    Node *path[100];
    int depth = 0 ;

    while(currentFolder!= NULL && depth<100){
        path[depth] = currentFolder;
        depth++;

        currentFolder = currentFolder->parent;
    }
    for (int i = depth - 1 ; i >= 0 ; i--){
        printf("%s", path[i]->name);
        if(i > 0 && i < depth-1 ){
            printf("/");
        }
    }
}

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
    newNode->parent = NULL;

    return newNode;
}

void addChild (Node *parent , Node *child) {
    child->parent = parent;
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
    if(root == NULL){
        printf("Unable to create root folder!");
        return 1;
    }
    Node *currentFolder = root;   //indicate in which folder we are 
    int choice ; 
    char name[50];

   

    Node *history[HISTORY_LIMIT];
    int historyCount = 1;
    int historyIndex = 0;

history[0] = root;

    while(1){
        printf("\n===== VIRTUAL FILE SYSTEM =====\n");
        printf("Current path: ");
        printPath(currentFolder);
        printf("\n\n");
        
        
        printf("1. Create Folder\n");
        printf("2. List Content\n");
        printf("3. Create a file\n");
        printf("4. Open Folder\n");
        printf("5. Go Back\n");
        printf("6. Go Forward\n");
        printf("7. Exit\n");
        printf("Enter you choice: ");
        scanf("%d", &choice);
        getchar();

        switch(choice){
            case 1: 
            {   
                printf("Enter name of the folder: " );
                fgets(name,sizeof(name), stdin);
                name[strcspn(name , "\n")] = '\0';

                Node *folder = createNode(name , FOLDER) ;

                if (folder==NULL){
                    printf("failed to create a folder");
                    break;
                }
                addChild(currentFolder, folder);
                printf("folder created succesfully\n");
                break;
            }
            case 2:
            {
                Node *current = currentFolder->firstChild;

                if (current == NULL){
                    printf("No folders exist yet\n");
                }
                printf("Current folder's content is:\n");
                while(current != NULL){
                    if(current->type == FOLDER){
                        printf("[DIR] %s/\n", current->name);
                       
                    }
                    else{
                        printf("[FILE] %s\n", current->name);
                        
                    }
                    current = current->nextSibling;
                }

                break;
            }
            case 3: {
                printf("Enter name of the file: " );
                fgets(name,sizeof(name), stdin);
                name[strcspn(name , "\n")] = '\0';

                Node *folder = createNode(name , FILE_TYPE) ;

                if (folder==NULL){
                    printf("failed to create a file");
                    break;
                }
                addChild(currentFolder, folder);
                printf("file created succesfully\n");
                break;
            }
            case 4:{
                char name[50];
                printf("Enter the name of the folder to open: ");
                fgets(name , sizeof(name), stdin);
                name[strcspn(name , "\n")] = '\0';

                Node *current = currentFolder->firstChild;

                while(current != NULL){
                    if(strcmp(current->name , name)==0 && current->type ==FOLDER){
                        recordVisit(history, &historyCount,
                        &historyIndex, current);
                        currentFolder = current;
                        printf("Folder Opened: %s\n", currentFolder->name);
                        break;
                    }
                    current = current->nextSibling;
                }
                if (current == NULL){
                    printf("Folder not found.\n");
                }
                break;
            }
            case 5 :
            {
               
            
            
                if(historyIndex > 0)
                    {
                    historyIndex--;
                    currentFolder = history[historyIndex];

                    printf("Moved back successfully.\n");
                        }
                    else
                    {
                        printf("No previous location.\n");
                    }

                    break;
                    }
            
            case 6: {
            

                    if(historyIndex < historyCount - 1)
                    {
                        historyIndex++;
                        currentFolder = history[historyIndex];

                        printf("Moved forward successfully.\n");
                    }
                    else
                    {
                        printf("No forward location.\n");
                    }

                    break;
                }

            
            case 7:{
                printf("Exiting the file system.....\n");
                return 0;
            }

            default :
                printf("invalid choice");
        }

    }
}