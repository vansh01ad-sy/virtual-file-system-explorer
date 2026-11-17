#include <stdio.h>
#include <ctype.h>
#include <string.h>
#include <stdlib.h>
#include <signal.h>

#define CLIPBOARD_NONE 0
#define CLIPBOARD_COPY 1
#define CLIPBOARD_MOVE 2

#define FOLDER 0        
#define FILE_TYPE 1     

#define HISTORY_LIMIT 100

#define TOTAL_DISK_BYTES 104857600ULL // 100 MiB (100 * 1024 * 1024)
#define BLOCK_SIZE 4096ULL           // 4 KiB
#define TOTAL_BLOCKS 25600           // 104857600 / 4096
#define BITMAP_SIZE_BYTES (TOTAL_BLOCKS / 8) // 3200 bytes
#define DATA_VERSION_HEADER "NODEVAULT_DATA|2"

unsigned char diskBitmap[BITMAP_SIZE_BYTES] = {0};
size_t allocatedBlockCount = 0;

static char g_fileLoadBuffer[262144];
static char g_recycleLoadBuffer[262144];
static char g_recyclePendingBuffer[262144];

static inline int isBlockAllocated(int blockId)
{
    if (blockId < 0 || blockId >= TOTAL_BLOCKS)
        return 1;
    return (diskBitmap[blockId / 8] & (1 << (blockId % 8))) != 0;
}

static inline void setBlockBit(int blockId, int val)
{
    if (blockId < 0 || blockId >= TOTAL_BLOCKS)
        return;
    if (val)
    {
        if (!(diskBitmap[blockId / 8] & (1 << (blockId % 8))))
        {
            diskBitmap[blockId / 8] |= (1 << (blockId % 8));
            allocatedBlockCount++;
        }
    }
    else
    {
        if (diskBitmap[blockId / 8] & (1 << (blockId % 8)))
        {
            diskBitmap[blockId / 8] &= ~(1 << (blockId % 8));
            if (allocatedBlockCount > 0)
                allocatedBlockCount--;
        }
    }
}

int allocateBlocks(size_t count, int *outBlocks)
{
    if (count == 0)
        return 1;
    if (outBlocks == NULL)
        return 0;
    if (TOTAL_BLOCKS - allocatedBlockCount < count)
        return 0;

    size_t found = 0;
    for (int i = 0; i < TOTAL_BLOCKS && found < count; i++)
    {
        if (!isBlockAllocated(i))
        {
            outBlocks[found++] = i;
        }
    }

    if (found < count)
        return 0;

    for (size_t i = 0; i < count; i++)
    {
        setBlockBit(outBlocks[i], 1);
    }
    return 1;
}

void freeBlocks(size_t count, const int *blocks)
{
    if (blocks == NULL || count == 0)
        return;
    for (size_t i = 0; i < count; i++)
    {
        setBlockBit(blocks[i], 0);
    }
}

static unsigned long long getDefaultFileSize(const char *name)
{
    if (name == NULL) return 4096;
    const char *dot = strrchr(name, '.');
    if (dot == NULL) return 4096;

    char ext[16];
    size_t i = 0;
    while (dot[i] && i < sizeof(ext) - 1)
    {
        ext[i] = (char)tolower((unsigned char)dot[i]);
        i++;
    }
    ext[i] = '\0';

    if (strcmp(ext, ".mp4") == 0 || strcmp(ext, ".mkv") == 0 || strcmp(ext, ".avi") == 0)
        return 2097152; // 2 MB (512 blocks)
    if (strcmp(ext, ".mp3") == 0 || strcmp(ext, ".wav") == 0 || strcmp(ext, ".flac") == 0)
        return 1258291; // ~1.2 MB (308 blocks)
    if (strcmp(ext, ".exe") == 0 || strcmp(ext, ".msi") == 0 || strcmp(ext, ".iso") == 0)
        return 1572864; // ~1.5 MB (384 blocks)
    if (strcmp(ext, ".zip") == 0 || strcmp(ext, ".rar") == 0 || strcmp(ext, ".7z") == 0 || strcmp(ext, ".tar") == 0)
        return 819200;  // 800 KB (200 blocks)
    if (strcmp(ext, ".jpg") == 0 || strcmp(ext, ".jpeg") == 0 || strcmp(ext, ".png") == 0 || strcmp(ext, ".gif") == 0 || strcmp(ext, ".webp") == 0)
        return 358400;  // 350 KB (88 blocks)
    if (strcmp(ext, ".pdf") == 0)
        return 98304;   // 96 KB (24 blocks)
    if (strcmp(ext, ".docx") == 0 || strcmp(ext, ".xlsx") == 0 || strcmp(ext, ".pptx") == 0)
        return 49152;   // 48 KB (12 blocks)
    if (strcmp(ext, ".c") == 0 || strcmp(ext, ".h") == 0 || strcmp(ext, ".cpp") == 0 ||
        strcmp(ext, ".java") == 0 || strcmp(ext, ".py") == 0 || strcmp(ext, ".js") == 0 ||
        strcmp(ext, ".jsx") == 0 || strcmp(ext, ".ts") == 0 || strcmp(ext, ".html") == 0 ||
        strcmp(ext, ".css") == 0 || strcmp(ext, ".json") == 0)
        return 8192;    // 8 KB (2 blocks)
    if (strcmp(ext, ".txt") == 0 || strcmp(ext, ".md") == 0 || strcmp(ext, ".log") == 0 || strcmp(ext, ".dat") == 0 || strcmp(ext, ".csv") == 0)
        return 4096;    // 4 KB (1 block)

    return 4096; // 4 KB default (1 block)
}

typedef struct Node {   
    char name[50];
    int type;
    size_t sizeBytes;
    size_t blockCount;
    int *allocatedBlocks;
    struct Node *firstChild;
    struct Node *nextSibling;
    struct Node *parent;
} Node;

typedef struct RecycleEntry {
    Node *node;
    Node *originalParent;
    struct RecycleEntry *next;
} RecycleEntry;

typedef struct TrieMatch {
    Node *node;
    struct TrieMatch *next;
} TrieMatch;

typedef struct TrieNode {
    struct TrieNode *children[256];
    TrieMatch *matches;
} TrieNode;

#define SORT_NAME_ASC 1
#define SORT_NAME_DESC 2
#define SORT_FOLDERS_FIRST 3
#define SORT_FILES_FIRST 4

int sortMode = SORT_NAME_ASC;

/* Compare two node names alphabetically, ignoring case. */
int compareNames(const char *a, const char *b)
{
    while (*a && *b)
    {
        int charA = tolower((unsigned char)*a);
        int charB = tolower((unsigned char)*b);

        if (charA != charB)
            return charA - charB;

        a++;
        b++;
    }

    return tolower((unsigned char)*a) -
           tolower((unsigned char)*b);
}

/* qsort comparator for filesystem nodes. */
int compareNodes(const void *a, const void *b)
{
    Node *nodeA = *(Node **)a;
    Node *nodeB = *(Node **)b;

    if (sortMode == SORT_FOLDERS_FIRST ||
        sortMode == SORT_FILES_FIRST)
    {
        if (nodeA->type != nodeB->type)
        {
            if (sortMode == SORT_FOLDERS_FIRST)
                return nodeA->type - nodeB->type;

            return nodeB->type - nodeA->type;
        }
    }

    int result = compareNames(nodeA->name, nodeB->name);

    if (sortMode == SORT_NAME_DESC)
        return -result;

    return result;
}

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


void printPath(Node *currentFolder)
{
    Node *path[100];
    int depth = 0;

    Node *temp = currentFolder;

    while (temp != NULL && depth < 100) {
        path[depth] = temp;
        depth++;
        temp = temp->parent;
    }

    for (int i = depth - 1; i >= 0; i--) {
        printf("%s", path[i]->name);

        if (i > 0 && i < depth-1) {
            printf("/");
        }
    }
}

int buildNodePath(Node *node, char *buffer, size_t bufferSize)
{
    Node *parts[100];
    int count = 0;

    while (node != NULL && count < 100)
    {
        parts[count++] = node;
        node = node->parent;
    }

    if (count == 0 || node != NULL)
        return 0;

    buffer[0] = '\0';
    size_t used = 0;

    for (int i = count - 1; i >= 0; i--)
    {
        int written;

        if (i == count - 1)
            written = snprintf(buffer + used, bufferSize - used,
                               "%s", parts[i]->name);
        else
            written = snprintf(buffer + used, bufferSize - used,
                               "%s%s", used > 1 ? "/" : "",
                               parts[i]->name);

        if (written < 0 || (size_t)written >= bufferSize - used)
            return 0;

        used += written;
    }

    return 1;
}


int containsIgnoreCase(const char *text, const char *query)
{
    if (*query == '\0')
        return 1;

    while (*text != '\0')
    {
        const char *a = text;
        const char *b = query;

        while (*a != '\0' && *b != '\0' &&
               tolower((unsigned char)*a) ==
               tolower((unsigned char)*b))
        {
            a++;
            b++;
        }

        if (*b == '\0')
            return 1;

        text++;
    }

    return 0;
}

void searchTree(Node *folder, const char *query)
{
    if (folder == NULL || folder->type != FOLDER)
        return;

    Node *current = folder->firstChild;

    while (current != NULL)
    {
        if (containsIgnoreCase(current->name, query))
        {
            char path[6000];

            if (buildNodePath(current, path, sizeof(path)))
            {
                printf("RESULT|%s|%d|%s\n",
                       current->name,
                       current->type,
                       path);
            }
        }

        if (current->type == FOLDER)
            searchTree(current, query);

        current = current->nextSibling;
    }
}
// Search only the direct contents of the current folder
void searchCurrentFolder(Node *folder, const char *query)
{
    if (folder == NULL || folder->type != FOLDER)
        return;

    Node *current = folder->firstChild;

    while (current != NULL)
    {
        if (containsIgnoreCase(current->name, query))
        {
            char path[6000];

            if (buildNodePath(current, path, sizeof(path)))
            {
                printf("RESULT|%s|%d|%s\n",
                       current->name,
                       current->type,
                       path);
            }
        }

        current = current->nextSibling;
    }
}
TrieNode *createTrieNode()
{
    return calloc(1, sizeof(TrieNode));
}

void insertTrie(TrieNode *root, Node *item)
{
    TrieNode *current = root;

    for (int i = 0; item->name[i] != '\0'; i++)
    {
        unsigned char ch = (unsigned char)
            tolower((unsigned char)item->name[i]);

        if (current->children[ch] == NULL)
        {
            current->children[ch] = createTrieNode();

            if (current->children[ch] == NULL)
                return;
        }

        current = current->children[ch];
    }

    TrieMatch *match = malloc(sizeof(TrieMatch));

    if (match == NULL)
        return;

    match->node = item;
    match->next = current->matches;
    current->matches = match;
}

void buildTrie(Node *folder, TrieNode *root)
{
    if (folder == NULL || folder->type != FOLDER)
        return;

    Node *current = folder->firstChild;

    while (current != NULL)
    {
        insertTrie(root, current);

        if (current->type == FOLDER)
            buildTrie(current, root);

        current = current->nextSibling;
    }
}

void printTrieMatches(TrieNode *root)
{
    if (root == NULL)
        return;

    TrieMatch *match = root->matches;

    while (match != NULL)
    {
        char path[6000];

        if (buildNodePath(match->node, path, sizeof(path)))
        {
            printf("RESULT|%s|%d|%s\n",
                   match->node->name,
                   match->node->type,
                   path);
        }

        match = match->next;
    }

    for (int i = 0; i < 256; i++)
        printTrieMatches(root->children[i]);
}

void freeTrie(TrieNode *root)
{
    if (root == NULL)
        return;

    for (int i = 0; i < 256; i++)
        freeTrie(root->children[i]);

    TrieMatch *match = root->matches;

    while (match != NULL)
    {
        TrieMatch *temp = match;
        match = match->next;
        free(temp);
    }

    free(root);
}

void prefixSearch(Node *folder, const char *query)
{
    TrieNode *root = createTrieNode();

    if (root == NULL)
        return;

    buildTrie(folder, root);

    TrieNode *current = root;

    for (int i = 0; query[i] != '\0'; i++)
    {
        unsigned char ch = (unsigned char)
            tolower((unsigned char)query[i]);

        current = current->children[ch];

        if (current == NULL)
        {
            freeTrie(root);
            return;
        }
    }

    printTrieMatches(current);
    freeTrie(root);
}
// Trie prefix search only in the current folder
void prefixSearchCurrentFolder(Node *folder, const char *query)
{
    TrieNode *root = createTrieNode();

    if (root == NULL)
        return;

    // Insert only direct children into the Trie
    Node *currentNode = folder->firstChild;

    while (currentNode != NULL)
    {
        insertTrie(root, currentNode);
        currentNode = currentNode->nextSibling;
    }

    TrieNode *current = root;

    for (int i = 0; query[i] != '\0'; i++)
    {
        unsigned char ch = (unsigned char)
            tolower((unsigned char)query[i]);

        current = current->children[ch];

        if (current == NULL)
        {
            freeTrie(root);
            return;
        }
    }

    printTrieMatches(current);
    freeTrie(root);
}
Node *findNodeByPath(Node *root, const char *path)
{
    if (root == NULL || path == NULL)
        return NULL;

    if (strcmp(path, "/") == 0)
        return root;

    char pathCopy[6000];
    strcpy(pathCopy, path);

    Node *current = root;
    char *token = strtok(pathCopy, "/");

    while (token != NULL)
    {
        Node *child = current->firstChild;

        while (child != NULL)
        {
            if (child->type == FOLDER &&
                strcmp(child->name, token) == 0)
                break;

            child = child->nextSibling;
        }

        if (child == NULL)
            return NULL;

        current = child;
        token = strtok(NULL, "/");
    }

    return current;
}



void freeTree(Node *node);

Node *createNode(char *name , int type){
    Node *newNode = (Node*)malloc(sizeof(Node));
    if (newNode == NULL){
    
        return NULL; 
    }
    strcpy(newNode->name, name);
    newNode->type = type;
    newNode->sizeBytes = 0;
    newNode->blockCount = 0;
    newNode->allocatedBlocks = NULL;
    newNode->firstChild = NULL;
    newNode->nextSibling = NULL;
    newNode->parent = NULL;

    return newNode;
}

int setFileSize(Node *node, size_t newSize)
{
    if (node == NULL || node->type != FILE_TYPE)
        return 0;

    if (newSize > TOTAL_DISK_BYTES)
        return 0;

    size_t newBlockCount = (newSize == 0) ? 0 : (newSize + BLOCK_SIZE - 1) / BLOCK_SIZE;

    if (newBlockCount == node->blockCount)
    {
        node->sizeBytes = newSize;
        return 1;
    }

    if (newBlockCount > node->blockCount)
    {
        size_t extra = newBlockCount - node->blockCount;
        if (TOTAL_BLOCKS - allocatedBlockCount < extra)
            return 0;

        int *extraBlocks = malloc(extra * sizeof(int));
        if (extraBlocks == NULL)
            return 0;

        if (!allocateBlocks(extra, extraBlocks))
        {
            free(extraBlocks);
            return 0;
        }

        int *newAlloc = realloc(node->allocatedBlocks, newBlockCount * sizeof(int));
        if (newAlloc == NULL)
        {
            freeBlocks(extra, extraBlocks);
            free(extraBlocks);
            return 0;
        }

        node->allocatedBlocks = newAlloc;
        memcpy(node->allocatedBlocks + node->blockCount, extraBlocks, extra * sizeof(int));
        free(extraBlocks);
        node->blockCount = newBlockCount;
        node->sizeBytes = newSize;
        return 1;
    }
    else
    {
        size_t toFree = node->blockCount - newBlockCount;
        freeBlocks(toFree, node->allocatedBlocks + newBlockCount);

        if (newBlockCount == 0)
        {
            free(node->allocatedBlocks);
            node->allocatedBlocks = NULL;
        }
        else
        {
            int *newAlloc = realloc(node->allocatedBlocks, newBlockCount * sizeof(int));
            if (newAlloc != NULL)
                node->allocatedBlocks = newAlloc;
        }

        node->blockCount = newBlockCount;
        node->sizeBytes = newSize;
        return 1;
    }
}

// Recursively create an independent copy of a node and its children.
Node *copyTree(Node *source)
{
    if (source == NULL)
        return NULL;

    // Create a new node with the same name and type.
    Node *newNode = createNode(source->name, source->type);

    if (newNode == NULL)
        return NULL;

    if (source->type == FILE_TYPE && source->sizeBytes > 0)
    {
        if (source->blockCount > 0)
        {
            if (TOTAL_BLOCKS - allocatedBlockCount < source->blockCount)
            {
                freeTree(newNode);
                return NULL;
            }

            newNode->allocatedBlocks = malloc(source->blockCount * sizeof(int));
            if (newNode->allocatedBlocks == NULL)
            {
                freeTree(newNode);
                return NULL;
            }

            if (!allocateBlocks(source->blockCount, newNode->allocatedBlocks))
            {
                free(newNode->allocatedBlocks);
                newNode->allocatedBlocks = NULL;
                freeTree(newNode);
                return NULL;
            }

            newNode->blockCount = source->blockCount;
        }
        newNode->sizeBytes = source->sizeBytes;
    }

    Node *child = source->firstChild;
    Node **nextPosition = &newNode->firstChild;

    // Copy every child recursively.
    while (child != NULL)
    {
        Node *childCopy = copyTree(child);

        if (childCopy == NULL)
        {
            // Clean up if allocation fails.
            freeTree(newNode);
            return NULL;
        }

        childCopy->parent = newNode;

        *nextPosition = childCopy;
        nextPosition = &childCopy->nextSibling;

        child = child->nextSibling;
    }

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

Node *findChild(Node *parent, const char *name)
{
    Node *current = parent->firstChild;

    while (current != NULL)
    {
        if (strcmp(current->name, name) == 0)
            return current;

        current = current->nextSibling;
    }

    return NULL;
}
int nameExists(Node *parent, const char *name)
{
    return findChild(parent, name) != NULL;
}

unsigned long long calculateNodeSize(const Node *node)
{
    if (node == NULL)
        return 0;

    if (node->type == FILE_TYPE)
        return (unsigned long long)node->sizeBytes;

    unsigned long long total = 0;
    Node *child = node->firstChild;
    while (child != NULL)
    {
        total += calculateNodeSize(child);
        child = child->nextSibling;
    }
    return total;
}

unsigned long long calculateNodeBlocks(const Node *node)
{
    if (node == NULL)
        return 0;

    if (node->type == FILE_TYPE)
        return (unsigned long long)node->blockCount;

    unsigned long long total = 0;
    Node *child = node->firstChild;
    while (child != NULL)
    {
        total += calculateNodeBlocks(child);
        child = child->nextSibling;
    }
    return total;
}

void collectSubtreeBlocks(const Node *node, int *outBlocks, size_t *outIndex, size_t maxBlocks)
{
    if (node == NULL || outBlocks == NULL || outIndex == NULL)
        return;

    if (node->type == FILE_TYPE)
    {
        for (size_t i = 0; i < node->blockCount && *outIndex < maxBlocks; i++)
        {
            outBlocks[(*outIndex)++] = node->allocatedBlocks[i];
        }
        return;
    }

    Node *child = node->firstChild;
    while (child != NULL)
    {
        collectSubtreeBlocks(child, outBlocks, outIndex, maxBlocks);
        child = child->nextSibling;
    }
}
int renameNode(Node *parent, const char *oldName,
               const char *newName)
{
    if (newName == NULL || newName[0] == '\0')
        return 0;

    if (strlen(newName) >= sizeof(((Node *)0)->name))
        return 0;

    Node *target = findChild(parent, oldName);

    if (target == NULL)
        return 0;

    if (strcmp(oldName, newName) == 0)
        return 1;

    if (nameExists(parent, newName))
        return 0;

    strcpy(target->name, newName);

    return 1;
}
int detachChild(Node *parent, Node *target)
{
    Node *current = parent->firstChild;
    Node *previous = NULL;

    while (current != NULL)
    {
        if (current == target)
        {
            if (previous == NULL)
                parent->firstChild = current->nextSibling;
            else
                previous->nextSibling = current->nextSibling;

            current->nextSibling = NULL;
            current->parent = NULL;

            return 1;
        }

        previous = current;
        current = current->nextSibling;
    }

    return 0;
}

int isInsideSubtree(Node *folder, Node *candidate)
{
    Node *current = candidate;

    while (current != NULL)
    {
        if (current == folder)
            return 1;

        current = current->parent;
    }

    return 0;
}
void invalidateMoveClipboard(
    Node *target,
    Node **clipboardNode,
    int *clipboardMode
)
{
    if (
        *clipboardMode == CLIPBOARD_MOVE &&
        *clipboardNode != NULL &&
        isInsideSubtree(target, *clipboardNode)
    )
    {
        *clipboardNode = NULL;
        *clipboardMode = CLIPBOARD_NONE;
    }
}

void removeDeletedFromHistory(Node *history[],
                              int *historyCount,
                              int *historyIndex,
                              Node *deletedRoot,
                              Node **currentFolder)
{
    int oldIndex = *historyIndex;
    int writeIndex = 0;
    int newIndex = 0;

    for (int i = 0; i < *historyCount; i++)
    {
        // Skip the deleted folder and all its descendants.
        if (isInsideSubtree(deletedRoot, history[i]))
            continue;

        if (i <= oldIndex)
            newIndex = writeIndex;

        history[writeIndex] = history[i];
        writeIndex++;
    }

    *historyCount = writeIndex;
    *historyIndex = newIndex;

    // Point currentFolder to a valid history entry.
    *currentFolder = history[newIndex];
}


int recycleNode(
    Node *parent,
    Node *target,
    RecycleEntry **recycleBin,
    Node **clipboardNode,
    int *clipboardMode
)
{
    if (target == NULL || target == parent)
        return 0;


    
    for (RecycleEntry *r = *recycleBin; r != NULL; r = r->next)
{
    if (isInsideSubtree(target, r->originalParent))
        return 0;
}
    RecycleEntry *entry = malloc(sizeof(RecycleEntry));

    if (entry == NULL)
        return 0;

    invalidateMoveClipboard(
        target,
        clipboardNode,
        clipboardMode
    );

    /* Detach only after memory for the entry is available. */
    if (!detachChild(parent, target))
    {
        free(entry);
        return 0;
    }

    entry->node = target;
    entry->originalParent = parent;
    entry->next = *recycleBin;
    *recycleBin = entry;

    return 1;
}

int isInTree(Node *root, Node *target)
{
    if (root == NULL)
        return 0;

    if (root == target)
        return 1;

    Node *child = root->firstChild;

    while (child != NULL)
    {
        if (isInTree(child, target))
            return 1;

        child = child->nextSibling;
    }

    return 0;
}
int restoreNode(Node *root, RecycleEntry **recycleBin,
                const char *name)
{
    RecycleEntry *current = *recycleBin;
    RecycleEntry *previous = NULL;

    while (current != NULL)
    {
        if (strcmp(current->node->name, name) == 0)
        {
            Node *parent = current->originalParent;

            if (!isInTree(root, parent))
                return 0;

            if (findChild(parent, name) != NULL)
                return 0;

            if (previous == NULL)
                *recycleBin = current->next;
            else
                previous->next = current->next;

            addChild(parent, current->node);
            free(current);

            return 1;
        }

        previous = current;
        current = current->next;
    }

    return 0;
}
void freeTree(Node *node)
{
    if (node == NULL)
        return;

    Node *child = node->firstChild;

    while (child != NULL)
    {
        Node *next = child->nextSibling;
        freeTree(child);
        child = next;
    }

    if (node->type == FILE_TYPE && node->allocatedBlocks != NULL)
    {
        freeBlocks(node->blockCount, node->allocatedBlocks);
        free(node->allocatedBlocks);
        node->allocatedBlocks = NULL;
        node->blockCount = 0;
        node->sizeBytes = 0;
    }

    free(node);
}


int saveTree(Node *node, FILE *file, int depth)
{
    if (node == NULL)
        return 1;

    if (node->type == FILE_TYPE && node->blockCount > 0)
    {
        if (fprintf(file, "%d|%d|%s|%llu|%llu|",
                    depth, node->type, node->name,
                    (unsigned long long)node->sizeBytes,
                    (unsigned long long)node->blockCount) < 0)
            return 0;

        for (size_t i = 0; i < node->blockCount; i++)
        {
            if (fprintf(file, "%d%s", node->allocatedBlocks[i],
                        (i + 1 < node->blockCount) ? "," : "") < 0)
                return 0;
        }
        if (fprintf(file, "\n") < 0)
            return 0;
    }
    else
    {
        if (fprintf(file, "%d|%d|%s|%llu|0|\n",
                    depth, node->type, node->name,
                    (unsigned long long)node->sizeBytes) < 0)
            return 0;
    }

    Node *child = node->firstChild;

    while (child != NULL)
    {
        if (!saveTree(child, file, depth + 1))
            return 0;

        child = child->nextSibling;
    }

    return 1;
}

int saveRecycleBin(RecycleEntry *recycleBin,
                   const char *filename)
{
    char tmpFilename[256];
    snprintf(tmpFilename, sizeof(tmpFilename), "%s.tmp", filename);
    FILE *file = fopen(tmpFilename, "w");

    if (file == NULL)
        return 0;

    if (fprintf(file, "%s\n", DATA_VERSION_HEADER) < 0)
    {
        fclose(file);
        return 0;
    }

    RecycleEntry *current = recycleBin;

    while (current != NULL)
    {
        char parentPath[6000];

        // Save the original location of the recycled item.
        if (!buildNodePath(current->originalParent,
                           parentPath, sizeof(parentPath)))
        {
            fclose(file);
            return 0;
        }

        if (fprintf(file, "ENTRY|%s\n", parentPath) < 0)
        {
            fclose(file);
            return 0;
        }

        // Save the complete recycled subtree.
        if (!saveTree(current->node, file, 0))
        {
            fclose(file);
            return 0;
        }

        current = current->next;
    }

    if (fclose(file) != 0)
        return 0;

    remove(filename);
    return (rename(tmpFilename, filename) == 0);
}


Node *loadTree(const char *filename)
{
    FILE *file = fopen(filename, "r");

    // First launch: no saved filesystem exists yet.
    if (file == NULL)
        return createNode("/", FOLDER);

    Node *levels[100] = {NULL};
    Node *root = NULL;

    char *line = g_fileLoadBuffer;
    int isVersion2 = 0;

    if (fgets(line, sizeof(g_fileLoadBuffer), file) != NULL)
    {
        line[strcspn(line, "\r\n")] = '\0';
        if (strcmp(line, DATA_VERSION_HEADER) == 0)
        {
            isVersion2 = 1;
        }
        else
        {
            rewind(file);
        }
    }
    else
    {
        fclose(file);
        return createNode("/", FOLDER);
    }

    while (fgets(line, sizeof(g_fileLoadBuffer), file) != NULL)
    {
        line[strcspn(line, "\r\n")] = '\0';
        if (line[0] == '\0')
            continue;

        int depth = 0;
        int type = 0;
        char name[50] = {0};
        unsigned long long sizeBytes = 0;
        unsigned long long blockCount = 0;
        char *blocksStr = NULL;

        if (isVersion2)
        {
            char *p1 = strchr(line, '|');
            if (!p1) goto load_error;
            *p1 = '\0';
            depth = atoi(line);

            char *p2 = strchr(p1 + 1, '|');
            if (!p2) goto load_error;
            *p2 = '\0';
            type = atoi(p1 + 1);

            char *p3 = strchr(p2 + 1, '|');
            if (!p3) goto load_error;
            *p3 = '\0';
            strncpy(name, p2 + 1, sizeof(name) - 1);

            char *p4 = strchr(p3 + 1, '|');
            if (!p4) goto load_error;
            *p4 = '\0';
            sizeBytes = strtoull(p3 + 1, NULL, 10);

            char *p5 = strchr(p4 + 1, '|');
            if (!p5)
            {
                blockCount = strtoull(p4 + 1, NULL, 10);
                blocksStr = "";
            }
            else
            {
                *p5 = '\0';
                blockCount = strtoull(p4 + 1, NULL, 10);
                blocksStr = p5 + 1;
            }
        }
        else
        {
            if (sscanf(line, "%d|%d|%49[^\n]", &depth, &type, name) != 3)
                goto load_error;
            sizeBytes = 0;
            blockCount = 0;
            blocksStr = "";
        }

        if (depth < 0 || depth >= 100)
            goto load_error;

        if (type != FOLDER && type != FILE_TYPE)
            goto load_error;

        Node *newNode = createNode(name, type);
        if (newNode == NULL)
            goto load_error;

        if (type == FILE_TYPE && blockCount > 0)
        {
            newNode->sizeBytes = (size_t)sizeBytes;
            newNode->blockCount = (size_t)blockCount;
            newNode->allocatedBlocks = malloc(blockCount * sizeof(int));
            if (newNode->allocatedBlocks == NULL)
            {
                free(newNode);
                goto load_error;
            }

            char *token = strtok(blocksStr, ",");
            size_t idx = 0;
            while (token != NULL && idx < blockCount)
            {
                int bId = atoi(token);
                newNode->allocatedBlocks[idx++] = bId;
                setBlockBit(bId, 1);
                token = strtok(NULL, ",");
            }
        }
        else if (type == FILE_TYPE)
        {
            newNode->sizeBytes = (size_t)sizeBytes;
            newNode->blockCount = 0;
            newNode->allocatedBlocks = NULL;
        }

        if (depth == 0)
        {
            if (root != NULL || type != FOLDER || strcmp(name, "/") != 0)
            {
                freeTree(newNode);
                goto load_error;
            }

            root = newNode;
            levels[0] = root;
        }
        else
        {
            if (root == NULL || levels[depth - 1] == NULL)
            {
                freeTree(newNode);
                goto load_error;
            }

            Node *parent = levels[depth - 1];

            if (parent->type != FOLDER)
            {
                freeTree(newNode);
                goto load_error;
            }

            addChild(parent, newNode);
            levels[depth] = newNode;
        }
    }

    if (ferror(file) || root == NULL)
        goto load_error;

    fclose(file);
    return root;

load_error:
    if (file) fclose(file);
    freeTree(root);
    return NULL;
}

Node *loadRecycleTree(FILE *file, char *pendingLine, int isVersion2)
{
    Node *levels[100] = {NULL};
    Node *recycledRoot = NULL;

    char *line = g_recycleLoadBuffer;

    while (1)
    {
        if (pendingLine[0] != '\0')
        {
            strcpy(line, pendingLine);
            pendingLine[0] = '\0';
        }
        else
        {
            if (fgets(line, sizeof(g_recycleLoadBuffer), file) == NULL)
                break;
        }

        // Next recycle-bin entry begins.
        if (strncmp(line, "ENTRY|", 6) == 0)
        {
            strcpy(pendingLine, line);
            break;
        }

        line[strcspn(line, "\r\n")] = '\0';
        if (line[0] == '\0')
            continue;

        int depth = 0;
        int type = 0;
        char name[50] = {0};
        unsigned long long sizeBytes = 0;
        unsigned long long blockCount = 0;
        char *blocksStr = NULL;

        if (isVersion2)
        {
            char *p1 = strchr(line, '|');
            if (!p1) return NULL;
            *p1 = '\0';
            depth = atoi(line);

            char *p2 = strchr(p1 + 1, '|');
            if (!p2) return NULL;
            *p2 = '\0';
            type = atoi(p1 + 1);

            char *p3 = strchr(p2 + 1, '|');
            if (!p3) return NULL;
            *p3 = '\0';
            strncpy(name, p2 + 1, sizeof(name) - 1);

            char *p4 = strchr(p3 + 1, '|');
            if (!p4) return NULL;
            *p4 = '\0';
            sizeBytes = strtoull(p3 + 1, NULL, 10);

            char *p5 = strchr(p4 + 1, '|');
            if (!p5)
            {
                blockCount = strtoull(p4 + 1, NULL, 10);
                blocksStr = "";
            }
            else
            {
                *p5 = '\0';
                blockCount = strtoull(p4 + 1, NULL, 10);
                blocksStr = p5 + 1;
            }
        }
        else
        {
            if (sscanf(line, "%d|%d|%49[^\n]", &depth, &type, name) != 3)
                return NULL;
            sizeBytes = 0;
            blockCount = 0;
            blocksStr = "";
        }

        if (depth < 0 || depth >= 100)
            return NULL;

        Node *node = createNode(name, type);
        if (node == NULL)
            return NULL;

        if (type == FILE_TYPE && blockCount > 0)
        {
            node->sizeBytes = (size_t)sizeBytes;
            node->blockCount = (size_t)blockCount;
            node->allocatedBlocks = malloc(blockCount * sizeof(int));
            if (node->allocatedBlocks == NULL)
            {
                free(node);
                return NULL;
            }

            char *token = strtok(blocksStr, ",");
            size_t idx = 0;
            while (token != NULL && idx < blockCount)
            {
                int bId = atoi(token);
                node->allocatedBlocks[idx++] = bId;
                setBlockBit(bId, 1);
                token = strtok(NULL, ",");
            }
        }
        else if (type == FILE_TYPE)
        {
            node->sizeBytes = (size_t)sizeBytes;
            node->blockCount = 0;
            node->allocatedBlocks = NULL;
        }

        if (depth == 0)
        {
            recycledRoot = node;
        }
        else
        {
            Node *parent = levels[depth - 1];

            if (parent == NULL || parent->type != FOLDER)
            {
                freeTree(node);
                return NULL;
            }

            node->parent = parent;

            if (parent->firstChild == NULL)
                parent->firstChild = node;
            else
            {
                Node *last = parent->firstChild;

                while (last->nextSibling != NULL)
                    last = last->nextSibling;

                last->nextSibling = node;
            }
        }

        levels[depth] = node;
    }

    return recycledRoot;
}

RecycleEntry *loadRecycleBin(Node *root, const char *filename)
{
    FILE *file = fopen(filename, "r");

    if (file == NULL)
        return NULL;

    RecycleEntry *recycleBin = NULL;
    RecycleEntry *last = NULL;

    char *line = g_recycleLoadBuffer;
    char *pendingLine = g_recyclePendingBuffer;
    pendingLine[0] = '\0';
    int isVersion2 = 0;

    while (1)
    {
        if (pendingLine[0] != '\0')
        {
            strcpy(line, pendingLine);
            pendingLine[0] = '\0';
        }
        else if (fgets(line, sizeof(g_recycleLoadBuffer), file) == NULL)
        {
            break;
        }

        line[strcspn(line, "\r\n")] = '\0';
        if (strcmp(line, DATA_VERSION_HEADER) == 0)
        {
            isVersion2 = 1;
            continue;
        }

        if (strncmp(line, "ENTRY|", 6) != 0)
            continue;

        char parentPath[1024];
        strcpy(parentPath, line + 6);

        Node *originalParent = findNodeByPath(root, parentPath);

        Node *recycledNode = loadRecycleTree(file, pendingLine, isVersion2);

        if (recycledNode == NULL || originalParent == NULL ||
            originalParent->type != FOLDER)
        {
            if (recycledNode != NULL)
                freeTree(recycledNode);

            continue;
        }

        RecycleEntry *entry = malloc(sizeof(RecycleEntry));

        if (entry == NULL)
        {
            freeTree(recycledNode);
            break;
        }

        entry->node = recycledNode;
        entry->originalParent = originalParent;
        entry->next = NULL;

        if (recycleBin == NULL)
            recycleBin = entry;
        else
            last->next = entry;

        last = entry;
    }

    fclose(file);
    return recycleBin;
}
int permanentlyDelete(
    RecycleEntry **recycleBin,
    const char *name,
    Node *history[],
    int *historyCount,
    int *historyIndex,
    Node **currentFolder,
    Node **clipboardNode,
    int *clipboardMode
)
{
    RecycleEntry *current = *recycleBin;
    RecycleEntry *previous = NULL;

    while (current != NULL)
    {
        if (strcmp(current->node->name, name) == 0)
        {
            if (previous == NULL)
                *recycleBin = current->next;
            else
                previous->next = current->next;

            // Clean navigation history BEFORE freeing memory.
            removeDeletedFromHistory(
                history,
                historyCount,
                historyIndex,
                current->node,
                currentFolder
            );
            invalidateMoveClipboard(
    current->node,
    clipboardNode,
    clipboardMode
);
            freeTree(current->node);
            free(current);

            return 1;
        }

        previous = current;
        current = current->next;
    }

    return 0;
}
void saveFilesystem(Node *root, RecycleEntry *recycleBin)
{
    FILE *file = fopen("filesystem.dat.tmp", "w");

    if (file == NULL)
    {
        fprintf(stderr, "Unable to save filesystem!\n");
    }
    else
    {
        int success = (fprintf(file, "%s\n", DATA_VERSION_HEADER) >= 0);
        if (success)
            success = saveTree(root, file, 0);

        if (fclose(file) != 0)
            success = 0;

        if (success)
        {
            remove("filesystem.dat");
            if (rename("filesystem.dat.tmp", "filesystem.dat") == 0)
                fprintf(stderr, "Filesystem saved successfully!\n");
            else
                fprintf(stderr, "Error renaming filesystem data file!\n");
        }
        else
        {
            fprintf(stderr, "Error saving filesystem!\n");
        }
    }

    if (saveRecycleBin(recycleBin, "recycle-bin.dat"))
        fprintf(stderr, "Recycle Bin saved successfully!\n");
    else
        fprintf(stderr, "Error saving Recycle Bin!\n");
}
int main(){
    signal(SIGINT, SIG_IGN);
    Node *root = loadTree("filesystem.dat");

if (root == NULL)
{
    fprintf(stderr, "Unable to load filesystem!\n");
    return 1;
}
    
    Node *currentFolder = root;   //indicate in which folder we are 

   

    Node *history[HISTORY_LIMIT];
    int historyCount = 1;
    int historyIndex = 0;

    history[0] = root;
    RecycleEntry *recycleBin = loadRecycleBin(root, "recycle-bin.dat");
    Node *clipboardNode = NULL; 

    int clipboardMode = CLIPBOARD_NONE;
    
    char command[6200];

while (1)
{
    

    if (fgets(command, sizeof(command), stdin) == NULL)
{
    saveFilesystem(root, recycleBin);
    break;
}

    command[strcspn(command, "\n")] = '\0';

    if (strcmp(command, "EXIT") == 0)
    {
        saveFilesystem(root, recycleBin);
        break;
    }


if (strncmp(command, "SEARCH|", 7) == 0)
{
    char *query = command + 7;
    char *separator = strchr(query, '|');

    if (separator == NULL)
    {
        printf("SEARCH_END\n");
        fflush(stdout);
    }
    else
    {
        *separator = '\0';
        char *scope = separator + 1;

        if (*query == '\0')
        {
            printf("SEARCH_END\n");
        }
        else if (strcmp(scope, "ALL") == 0)
        {
            searchTree(root, query);
            printf("SEARCH_END\n");
        }
        else if (strcmp(scope, "CURRENT") == 0)
{
    searchCurrentFolder(currentFolder, query);
    printf("SEARCH_END\n");
}
        else
        {
            printf("SEARCH_END\n");
        }

        fflush(stdout);
    }
}

else if (strncmp(command, "PREFIX|", 7) == 0)
{
    char *query = command + 7;
    char *separator = strchr(query, '|');

    if (separator != NULL)
    {
        *separator = '\0';
        char *scope = separator + 1;

        if (*query != '\0')
        {
            if (strcmp(scope, "ALL") == 0)
                prefixSearch(root, query);

            else if (strcmp(scope, "CURRENT") == 0)
    prefixSearchCurrentFolder(currentFolder, query);
        }
    }

    printf("SEARCH_END\n");
    fflush(stdout);
}
else if (strcmp(command, "PATH") == 0)





{
    printf("PATH|");
    printPath(currentFolder);
    printf("\nEND\n");
    fflush(stdout);
}

    else if (strncmp(command, "GOTO_PATH|", 10) == 0)
{
    char *targetPath = command + 10;

    if (strlen(targetPath) >= 6000)
    {
        printf("ERROR|Path is too long\n");
    }
    else
    {
        Node *target = findNodeByPath(root, targetPath);

        if (target != NULL && target->type == FOLDER)
        {
            recordVisit(
                history,
                &historyCount,
                &historyIndex,
                target
            );

            currentFolder = target;

            printf("OK|Navigation successful\n");
        }
        else
        {
            printf("ERROR|Folder not found\n");
        }
    }

    printf("END\n");
    fflush(stdout);
}
else if (strncmp(command, "SORT|", 5) == 0)
{
    int requestedMode;

    if (sscanf(command + 5, "%d", &requestedMode) == 1 &&
        requestedMode >= SORT_NAME_ASC &&
        requestedMode <= SORT_FILES_FIRST)
    {
        sortMode = requestedMode;

        printf("SORT_OK|%d\n", sortMode);
    }
    else
    {
        printf("ERROR|Invalid sort mode\n");
    }

    fflush(stdout);
}
else if (strcmp(command, "LIST") == 0)
{
    int count = 0;
    Node *current = currentFolder->firstChild;

    /* Count the children. */
    while (current != NULL)
    {
        count++;
        current = current->nextSibling;
    }

    /* Store node pointers in a temporary array. */
    Node **items = NULL;

    if (count > 0)
    {
        items = malloc(count * sizeof(Node *));

        if (items == NULL)
        {
            printf("ERROR|Memory allocation failed\n");
            printf("LIST_END\n");
            fflush(stdout);
            continue;
        }

        current = currentFolder->firstChild;

        for (int i = 0; i < count; i++)
        {
            items[i] = current;
            current = current->nextSibling;
        }

        /* Sort the temporary array. */
        qsort(items, count, sizeof(Node *), compareNodes);

        /* Print sorted results. */
        for (int i = 0; i < count; i++)
        {
            unsigned long long displaySize = calculateNodeSize(items[i]);
            printf("ITEM|%s|%d|%llu\n", items[i]->name, items[i]->type, displaySize);
        }

        free(items);
    }

    printf("LIST_END\n");
    fflush(stdout);
}

    
else if (strncmp(command, "CREATE_FOLDER|", 14) == 0)
{
    char *name = command + 14;

    if (*name == '\0')
    {
        printf("ERROR|Folder name required\n");
          printf("END\n");
    }
    else if (nameExists(currentFolder, name))
{
    printf("ERROR|An item with this name already exists\n");
    printf("END\n");
}
    else
    {   
        
        Node *folder = createNode(name, FOLDER);

        if (folder == NULL)
        {
            printf("ERROR|Memory allocation failed\n");
            printf("END\n");
        }
        else
        {
            addChild(currentFolder, folder);
            printf("OK|Folder created|%s\n", name);
            printf("END\n");
        }
    }

    fflush(stdout);
}
        else if (strncmp(command, "CREATE_FILE|", 12) == 0)
        {
            char *arg = command + 12;
            char *separator = strchr(arg, '|');
            char *name = arg;
            unsigned long long initialSize = 0;

            if (separator != NULL)
            {
                *separator = '\0';
                initialSize = strtoull(separator + 1, NULL, 10);
            }
            else
            {
                initialSize = getDefaultFileSize(name);
            }

            if (*name == '\0')
            {
                printf("ERROR|File name required\n");
                printf("END\n");
            }
            else if (nameExists(currentFolder, name))
            {
                printf("ERROR|An item with this name already exists\n");
                printf("END\n");
            }
            else
            {
                Node *file = createNode(name, FILE_TYPE);

                if (file == NULL)
                {
                    printf("ERROR|Memory allocation failed\n");
                    printf("END\n");
                }
                else
                {
                    if (initialSize > 0)
                    {
                        if (!setFileSize(file, (size_t)initialSize))
                        {
                            freeTree(file);
                            printf("ERROR|Insufficient disk space\n");
                            printf("END\n");
                            fflush(stdout);
                            continue;
                        }
                    }
                    addChild(currentFolder, file);
                    printf("OK|File created|%s|%llu\n", name, (unsigned long long)file->sizeBytes);
                    printf("END\n");
                }
            }

            fflush(stdout);
        }
        
        
            else if (strncmp(command, "OPEN_FOLDER|", 12) == 0)
            {
                char *name = command + 12;
                Node *current = currentFolder->firstChild;

                while (current != NULL)
                {
                    if (strcmp(current->name, name) == 0 &&
                        current->type == FOLDER)
                    {
                        recordVisit(history, &historyCount,
                                    &historyIndex, current);

                        currentFolder = current;
                        printf("OK|Folder opened|%s\n", currentFolder->name);
                        break;
                    }

                    current = current->nextSibling;
                }

                if (current == NULL)
                    printf("ERROR|Folder not found\n");

                printf("END\n");
                fflush(stdout);
            }

        
            else if (strcmp(command, "BACK") == 0)
            {
                if (historyIndex > 0)
                {
                    historyIndex--;
                    currentFolder = history[historyIndex];
                    printf("OK|Moved back\n");
                }
                else
                {
                    printf("ERROR|No previous location\n");
                }

                printf("END\n");
                fflush(stdout);
            }

        
            else if (strcmp(command, "FORWARD") == 0)
            {
                if (historyIndex < historyCount - 1)
                {
                    historyIndex++;
                    currentFolder = history[historyIndex];
                    printf("OK|Moved forward\n");
                }
                else
                {
                    printf("ERROR|No forward location\n");
                }

                printf("END\n");
                fflush(stdout);
            }
            //recyle bin
            else if (strncmp(command, "DELETE|", 7) == 0)
        {
        char *name = command + 7;
        Node *target = findChild(currentFolder, name);

            if (*name == '\0')
                printf("ERROR|Item name required\n");
            else if (target == NULL)
                printf("ERROR|Item not found\n");
            
            else if (recycleNode(
    currentFolder,
    target,
    &recycleBin,
    &clipboardNode,
    &clipboardMode
))
                printf("OK|Item recycled|%s\n", name);
            else
                printf("ERROR|Unable to recycle item\n");

            printf("END\n");
            fflush(stdout);
        }
        else if (strcmp(command, "RECYCLE_LIST") == 0)
        {
            RecycleEntry *current = recycleBin;

            while (current != NULL)
            {
                unsigned long long displaySize = calculateNodeSize(current->node);
                printf("ITEM|%s|%d|%llu\n",
                    current->node->name,
                    current->node->type,
                    displaySize);

                current = current->next;
            }

            printf("LIST_END\n");
            fflush(stdout);
        }
        else if (strncmp(command, "RESTORE|", 8) == 0)
        {
            char *name = command + 8;

            if (*name == '\0')
                printf("ERROR|Item name required\n");
            else if (restoreNode(root, &recycleBin, name))
                printf("OK|Item restored|%s\n", name);
            else
                printf("ERROR|Unable to restore item\n");

            printf("END\n");
            fflush(stdout);
        }
        else if (strncmp(command, "PERMANENT_DELETE|", 17) == 0)
        {
            char *name = command + 17;

            if (*name == '\0')
                printf("ERROR|Item name required\n");
            else if (permanentlyDelete(
    &recycleBin,
    name,
    history,
    &historyCount,
    &historyIndex,
    &currentFolder,
    &clipboardNode,
    &clipboardMode))
                printf("OK|Item permanently deleted|%s\n", name);
            else
                printf("ERROR|Item not found in Recycle Bin\n");

            printf("END\n");
            fflush(stdout);
        }
        else if (strncmp(command, "RENAME|", 7) == 0)
{
    char *arguments = command + 7;
    char *separator = strchr(arguments, '|');

    if (separator == NULL)
    {
        printf("ERROR|Expected old name and new name\n");
    }
    else
    {
        *separator = '\0';

        char *oldName = arguments;
        char *newName = separator + 1;

        if (*oldName == '\0' || *newName == '\0')
        {
            printf("ERROR|Both names are required\n");
        }
        else if (renameNode(currentFolder, oldName, newName))
        {
            printf("OK|Item renamed|%s|%s\n",
                   oldName, newName);
        }
        else
        {
            printf("ERROR|Rename failed: item not found or name already exists\n");
        }
    }

    printf("END\n");
    fflush(stdout);
}

    else if (strncmp(command, "COPY|", 5) == 0)
{
    char *name = command + 5;

    Node *target = findChild(currentFolder, name);

    if (target == NULL)
    {
        printf("ERROR|Item not found\n");
    }
    else
    {
        // Free the previous clipboard snapshot, if any.
        if (clipboardMode == CLIPBOARD_COPY)
        {
            freeTree(clipboardNode);
        }

        // Create an independent snapshot.
        clipboardNode = copyTree(target);

        if (clipboardNode == NULL)
        {
            clipboardMode = CLIPBOARD_NONE;
            printf("ERROR|Memory allocation failed\n");
        }
        else
        {
            clipboardMode = CLIPBOARD_COPY;
            printf("OK|Copied %s\n", name);
        }
    }

    printf("END\n");
    fflush(stdout);
}
else if (strncmp(command, "CUT|", 4) == 0)
{
    char *name = command + 4;

    Node *target = findChild(currentFolder, name);

    if (target == NULL)
    {
        printf("ERROR|Item not found\n");
    }
    else
    {
        // Discard the previous COPY snapshot.
        if (clipboardMode == CLIPBOARD_COPY)
        {
            freeTree(clipboardNode);
        }

        clipboardNode = target;
        clipboardMode = CLIPBOARD_MOVE;

        printf("OK|Ready to move %s\n", name);
    }

    printf("END\n");
    fflush(stdout);
}
else if (strcmp(command, "PASTE") == 0)
{
    if (clipboardMode == CLIPBOARD_NONE || clipboardNode == NULL)
    {
        printf("ERROR|Clipboard is empty\n");
    }
    else if (nameExists(currentFolder, clipboardNode->name))
    {
        printf("ERROR|An item with this name already exists\n");
    }
    else if (
        clipboardMode == CLIPBOARD_MOVE &&
        clipboardNode->type == FOLDER &&
        isInsideSubtree(clipboardNode, currentFolder)
    )
    {
        printf("ERROR|Cannot move a folder into itself or its descendant\n");
    }
    else if (clipboardMode == CLIPBOARD_COPY)
    {
        Node *newNode = copyTree(clipboardNode);

        if (newNode == NULL)
        {
            printf("ERROR|Memory allocation failed\n");
        }
        else
        {
            addChild(currentFolder, newNode);
            printf("OK|Item copied successfully\n");
        }
    }
    else if (clipboardMode == CLIPBOARD_MOVE)
    {
        Node *oldParent = clipboardNode->parent;

        if (oldParent == currentFolder)
        {
            printf("ERROR|Item is already in this folder\n");
        }
        else
        {
            detachChild(oldParent, clipboardNode);
            addChild(currentFolder, clipboardNode);

            clipboardNode = NULL;
            clipboardMode = CLIPBOARD_NONE;

            printf("OK|Item moved successfully\n");
        }
    }

    printf("END\n");
    fflush(stdout);
}

    else if (strcmp(command, "CLIPBOARD_STATUS") == 0)
{
    if (clipboardMode == CLIPBOARD_COPY && clipboardNode != NULL)
    {
        printf("CLIPBOARD|COPY|%s\n", clipboardNode->name);
    }
    else if (clipboardMode == CLIPBOARD_MOVE && clipboardNode != NULL)
{
    char path[6000];

    if (buildNodePath(clipboardNode, path, sizeof(path)))
        printf("CLIPBOARD|MOVE|%s|%s\n",
               clipboardNode->name, path);
    else
        printf("CLIPBOARD|MOVE|%s|\n",
               clipboardNode->name);
}
    else
    {
        printf("CLIPBOARD|NONE|\n");
    }

    printf("END\n");
    fflush(stdout);
}
else if (strcmp(command, "CANCEL_CLIPBOARD") == 0)
{
    if (clipboardMode == CLIPBOARD_COPY && clipboardNode != NULL)
    {
        freeTree(clipboardNode);
    }

    clipboardNode = NULL;
    clipboardMode = CLIPBOARD_NONE;

    printf("OK|Clipboard cleared\n");
    printf("END\n");
    fflush(stdout);
}
else if (strcmp(command, "DISK_STATUS") == 0)
{
    unsigned long long totalB = TOTAL_DISK_BYTES;
    unsigned long long usedB = (unsigned long long)allocatedBlockCount * BLOCK_SIZE;
    unsigned long long freeB = (totalB >= usedB) ? (totalB - usedB) : 0;
    int totalBlk = TOTAL_BLOCKS;
    int allocBlk = (int)allocatedBlockCount;
    int freeBlk = totalBlk - allocBlk;
    int blkSz = (int)BLOCK_SIZE;

    printf("DISK|%llu|%llu|%llu|%d|%d|%d|%d\n",
           totalB, usedB, freeB, totalBlk, allocBlk, freeBlk, blkSz);
    printf("END\n");
    fflush(stdout);
}
else if (strncmp(command, "SET_FILE_SIZE|", 14) == 0)
{
    char *arg = command + 14;
    char *separator = strchr(arg, '|');

    if (separator == NULL)
    {
        printf("ERROR|File name and size required\n");
    }
    else
    {
        *separator = '\0';
        char *name = arg;
        unsigned long long newSize = strtoull(separator + 1, NULL, 10);

        Node *target = findChild(currentFolder, name);
        if (target == NULL)
        {
            printf("ERROR|File not found\n");
        }
        else if (target->type != FILE_TYPE)
        {
            printf("ERROR|Item is not a file\n");
        }
        else
        {
            if (setFileSize(target, (size_t)newSize))
            {
                printf("OK|File resized|%s|%llu\n", name, (unsigned long long)target->sizeBytes);
            }
            else
            {
                printf("ERROR|Insufficient disk space\n");
            }
        }
    }

    printf("END\n");
    fflush(stdout);
}
else if (strncmp(command, "FILE_STORAGE|", 13) == 0)
{
    char *name = command + 13;
    Node *target = findChild(currentFolder, name);

    if (target == NULL)
    {
        printf("ERROR|Item not found\n");
    }
    else
    {
        unsigned long long totalSize = calculateNodeSize(target);
        unsigned long long totalBlocks = calculateNodeBlocks(target);

        printf("STORAGE|%s|%d|%llu|%llu|",
               target->name,
               target->type,
               totalSize,
               totalBlocks);

        if (target->type == FILE_TYPE)
        {
            for (size_t i = 0; i < target->blockCount; i++)
            {
                printf("%d%s", target->allocatedBlocks[i],
                       (i + 1 < target->blockCount) ? "," : "");
            }
        }
        else
        {
            if (totalBlocks > 0 && totalBlocks <= TOTAL_BLOCKS)
            {
                int *folderBlocks = malloc(totalBlocks * sizeof(int));
                if (folderBlocks != NULL)
                {
                    size_t collected = 0;
                    collectSubtreeBlocks(target, folderBlocks, &collected, totalBlocks);
                    for (size_t i = 0; i < collected; i++)
                    {
                        printf("%d%s", folderBlocks[i],
                               (i + 1 < collected) ? "," : "");
                    }
                    free(folderBlocks);
                }
            }
        }
        printf("\n");
    }

    printf("END\n");
    fflush(stdout);
}
        else
        {
            printf("ERROR|Unknown command\n");
             printf("END\n");
            fflush(stdout);
        }

}
return 0 ;
}